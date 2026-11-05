"use client";

import { Check, Lock, Plus, Search, ShieldAlert, UserPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { searchHeroesAction, suggestHeroesAction } from "@/app/agencia/negocios/actions";
import { Avatar, Badge, Button, Checkbox, Dialog, FormField, IconButton, Input, Spinner, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import {
  buildSuggestItems,
  checkSuggestLimits,
  filterAndSortCasting,
  followersLabel,
  mergePlatformPages,
  MAX_NEW_PER_SAVE,
  MAX_SUGGEST,
  metCount,
  normalizeQuery,
  sameTypedName,
  scopeBadge,
  validateTypedHero,
  type PlatformHero,
  type TypedHero,
  type TypedHeroErrors,
} from "@/lib/deals/hero-suggest";
import type { DealTalentRow } from "@/lib/deals/queries";
import type { Conflict } from "@/lib/offer/counteroffer";

/** Ficha do casting da agência (com ou sem Hero ligado) que pode entrar no negócio. */
export type Candidate = { id: string; name: string; slug: string | null; hasHero: boolean; avatarUrl: string | null; city: string | null; state: string | null; availability: string; hasLogin: boolean; reasons: DealTalentRow["reasons"] };

type Props = {
  dealId: string;
  candidates: Candidate[];
  current: { talentId: string; reasons: DealTalentRow["reasons"]; keep: boolean }[];
  conflicts: Record<string, Conflict[]>;
  onClose: () => void;
  /** Ações do servidor (padrão); os testes de tela trocam por dados de exemplo. */
  actions?: { search: typeof searchHeroesAction; suggest: typeof suggestHeroesAction };
};

type TypedEntry = TypedHero & { key: string };

// Sugerir Heros ao negócio (0093). Três origens: ficha do casting (ordenada pelos critérios do briefing), Hero da
// plataforma que ainda não está no casting (busca no servidor, 20 por vez; a ficha nasce ao salvar) e Hero digitado
// que não está na plataforma (ficha só com o nome). Hero que já é de outra agência aparece indisponível, sem escolha.
export function SuggestHeroesDialog({ dealId, candidates, current, conflicts, onClose, actions = { search: searchHeroesAction, suggest: suggestHeroesAction } }: Props) {
  const t = useTranslations("agency.deal.talents");
  const tx = useTranslations("offer.conflict");
  const tr = useTranslations("commercial.reasons");
  const tp = useTranslations("common.pillars");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [ids, setIds] = useState<string[]>(current.map((c) => c.talentId));
  const [picked, setPicked] = useState<Record<string, PlatformHero>>({});
  const [typed, setTyped] = useState<TypedEntry[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState({ name: "", profile: "", email: "" });
  const [draftErrors, setDraftErrors] = useState<TypedHeroErrors>({});
  const [draftDup, setDraftDup] = useState(false);
  const [platform, setPlatform] = useState<PlatformHero[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [searching, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const latest = useRef(0);
  const locked = new Set(current.filter((c) => c.keep).map((c) => c.talentId));

  // texto da busca com atraso curto: cada digitação não vira uma ida ao servidor
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(normalizeQuery(q)), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  // primeira página (e nova busca): a lista da plataforma recomeça do zero
  useEffect(() => {
    const seq = ++latest.current;
    startSearch(async () => {
      const result = await actions.search({ dealId, q: debounced, offset: 0 });
      if (seq !== latest.current) return;
      if (result.ok) {
        setPlatform(result.items);
        setHasMore(result.hasMore);
        setSearchError(null);
      } else {
        setPlatform([]);
        setHasMore(false);
        setSearchError(result.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as ações são fixas durante a vida do diálogo
  }, [dealId, debounced, retry]);

  function loadMore() {
    const seq = ++latest.current;
    startSearch(async () => {
      const result = await actions.search({ dealId, q: debounced, offset: platform.length });
      if (seq !== latest.current) return;
      if (result.ok) {
        setPlatform((cur) => mergePlatformPages(cur, result.items));
        setHasMore(result.hasMore);
        setSearchError(null);
      } else {
        setSearchError(result.error);
      }
    });
  }

  const casting = useMemo(() => filterAndSortCasting(candidates, q), [candidates, q]);
  const pickedList = Object.values(picked);
  const items = useMemo(
    () =>
      buildSuggestItems({
        talents: ids.map((id) => ({ id, reasons: candidates.find((c) => c.id === id)?.reasons ?? current.find((c) => c.talentId === id)?.reasons ?? [] })),
        heroes: Object.keys(picked).map((id) => ({ id })),
        typed,
      }),
    [ids, picked, typed, candidates, current],
  );
  const newCount = pickedList.length + typed.length;

  function toggleTalent(id: string, on: boolean) {
    setIds((cur) => (on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id)));
  }
  function toggleHero(hero: PlatformHero, on: boolean) {
    setPicked((cur) => {
      const next = { ...cur };
      if (on) next[hero.id] = hero;
      else delete next[hero.id];
      return next;
    });
  }

  function addTyped(event: FormEvent) {
    event.preventDefault();
    const result = validateTypedHero(draft);
    if (!result.ok) {
      setDraftErrors(result.errors);
      setDraftDup(false);
      return;
    }
    if (typed.some((x) => sameTypedName(x.name, result.value.name))) {
      setDraftErrors({});
      setDraftDup(true);
      return;
    }
    setTyped((cur) => [...cur, { ...result.value, key: `${Date.now()}-${cur.length}` }]);
    setDraft({ name: "", profile: "", email: "" });
    setDraftErrors({});
    setDraftDup(false);
    setTyping(false);
  }

  function save() {
    setError(null);
    const limit = checkSuggestLimits(items);
    if (limit === "too_many") return setError(t("limits.tooMany", { max: MAX_SUGGEST }));
    if (limit === "too_many_new") return setError(t("limits.tooManyNew", { max: MAX_NEW_PER_SAVE }));
    startSave(async () => {
      const result = await actions.suggest({ dealId, items });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  const draftError = (key: keyof TypedHeroErrors) => (draftErrors[key] ? t(`typed.errors.${key}.${draftErrors[key]}`) : undefined);
  const nothing = casting.length === 0 && platform.length === 0 && typed.length === 0 && !searching && !searchError;

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("addTitle")}
      description={t("addHint")}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t("back")}
          </Button>
          <Button type="button" onClick={save} loading={saving} data-testid="shortlist-save">
            {t("saveShortlist", { count: items.length })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="sticky top-0 z-10 -mx-1 -mt-2 bg-surface px-1 pb-1 pt-2">
          <FormField label={t("search")}>
            <Input
              type="search"
              value={q}
              maxLength={60}
              placeholder={t("searchPlaceholder")}
              onChange={(e) => setQ(e.target.value)}
              leadingIcon={<Search />}
              trailingIcon={searching ? <Spinner size="sm" label={t("searching")} /> : undefined}
              autoComplete="off"
              data-testid="hero-search"
            />
          </FormField>
        </div>

        {newCount > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-info/30 bg-info-soft/40 px-3 py-2" data-testid="new-ficha-notice">
            <p className="type-body-sm text-fg">{t("newFichaNotice", { count: newCount })}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t("newFichaList")}>
              {pickedList.map((h) => (
                <li key={h.id}>
                  <Badge size="md" variant="info" className="gap-1 pr-1">
                    {h.name}
                    <IconButton icon={<X />} label={t("untick", { name: h.name })} size="sm" className="size-5 min-h-0 min-w-0" onClick={() => toggleHero(h, false)} disabled={saving} />
                  </Badge>
                </li>
              ))}
              {typed.map((x) => (
                <li key={x.key}>
                  <Badge size="md" variant="neutral" className="gap-1 pr-1">
                    {x.name}
                    <IconButton icon={<X />} label={t("untick", { name: x.name })} size="sm" className="size-5 min-h-0 min-w-0" onClick={() => setTyped((cur) => cur.filter((y) => y.key !== x.key))} disabled={saving} />
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {casting.length > 0 ? (
          <section className="flex flex-col gap-2" aria-labelledby="suggest-casting">
            <h3 id="suggest-casting" className="text-sm font-semibold text-fg">
              {t("castingTitle", { count: casting.length })}
            </h3>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {casting.map((c) => {
                const met = metCount(c.reasons);
                const badge = scopeBadge("casting");
                return (
                  <li key={c.id} className="flex items-start gap-1 p-2 pr-3" data-testid="suggest-casting-row">
                    <Checkbox aria-label={c.name} checked={ids.includes(c.id)} disabled={saving || locked.has(c.id)} onChange={(e) => toggleTalent(c.id, e.target.checked)} />
                    <span className="mt-2 flex min-w-0 flex-1 items-start gap-3">
                      <Avatar src={c.avatarUrl} name={c.name} size="sm" alt="" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-fg">{c.name}</span>
                          <Badge size="sm" variant={badge.variant} icon={<Check />}>
                            {t("scope.casting")}
                          </Badge>
                          {!c.hasHero ? <Badge size="sm">{t("noHeroPage")}</Badge> : null}
                        </span>
                        <span className="type-caption text-fg-muted">{[c.city, c.state].filter(Boolean).join(" · ") || t("noLocation")}</span>
                        <span className="flex flex-wrap gap-1">
                          {c.reasons.map((r) => (
                            <Badge key={r.code} size="sm" variant={r.met ? "success" : "neutral"}>
                              {tr(r.code)}
                            </Badge>
                          ))}
                          {c.reasons.length > 0 ? <span className="type-caption text-fg-muted">{t("matchCount", { met, total: c.reasons.length })}</span> : null}
                        </span>
                        {conflicts[c.id] ? (
                          <span className="flex flex-col gap-0.5" data-testid="candidate-conflict">
                            <Badge size="sm" variant="warning" icon={<ShieldAlert />} className="w-fit">
                              {tx("badge")}
                            </Badge>
                            <span className="type-caption text-fg-muted">{(conflicts[c.id] ?? []).map((x) => x.brandName).join(", ")}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2" aria-labelledby="suggest-platform" aria-busy={searching}>
          <h3 id="suggest-platform" className="text-sm font-semibold text-fg">
            {t("platformTitle")}
          </h3>
          {platform.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {platform.map((h) => {
                const badge = scopeBadge(h.scope);
                const followers = followersLabel(h.followers, locale);
                const networks = [h.socials.instagram ? `Instagram ${h.socials.instagram}` : null, h.socials.youtube ? `YouTube ${h.socials.youtube}` : null].filter(Boolean).join(" · ");
                const hintId = `hero-hint-${h.id}`;
                return (
                  <li key={h.id} className="flex items-start gap-1 p-2 pr-3" data-testid="suggest-platform-row" data-scope={h.scope}>
                    {badge.selectable ? (
                      <Checkbox aria-label={h.name} aria-describedby={hintId} checked={Boolean(picked[h.id])} disabled={saving} onChange={(e) => toggleHero(h, e.target.checked)} />
                    ) : (
                      <span className="inline-flex size-11 shrink-0 items-center justify-center text-fg-subtle" aria-hidden="true">
                        <Lock className="size-4" />
                      </span>
                    )}
                    <span className={`mt-2 flex min-w-0 flex-1 items-start gap-3 ${badge.selectable ? "" : "opacity-80"}`}>
                      <Avatar src={h.avatarUrl} name={h.name} size="sm" alt="" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-fg">{h.name}</span>
                          <Badge size="sm" variant={badge.variant}>
                            {t(`scope.${h.scope}`)}
                          </Badge>
                        </span>
                        {h.headline ? <span className="type-caption text-fg-muted">{h.headline}</span> : null}
                        {h.pillars.length > 0 || followers || networks ? (
                          <span className="flex flex-wrap items-center gap-1">
                            {h.pillars.map((p) => (
                              <Badge key={p} size="sm" variant={p as "routine"}>
                                {tp(p as "routine")}
                              </Badge>
                            ))}
                            {followers ? <span className="type-caption text-fg-muted">{t("followers", { count: followers })}</span> : null}
                            {networks ? <span className="type-caption text-fg-muted">{networks}</span> : null}
                          </span>
                        ) : null}
                        <span id={hintId} className={`type-caption ${badge.selectable ? "text-info" : "text-fg-muted"}`}>
                          {t(`scopeHint.${h.scope}`)}
                        </span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {searching && platform.length === 0 ? <p className="type-body-sm text-fg-muted">{t("searching")}</p> : null}
          {platform.length === 0 && !searching && !searchError ? <p className="type-body-sm text-fg-muted">{t("noPlatform")}</p> : null}
          {searchError ? (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <p className="type-body-sm text-danger">{searchError}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)} disabled={searching}>
                {t("retry")}
              </Button>
            </div>
          ) : null}
          {hasMore ? (
            <Button type="button" variant="secondary" size="sm" onClick={loadMore} loading={searching} className="w-fit" data-testid="hero-load-more">
              {t("loadMore")}
            </Button>
          ) : null}
        </section>

        {nothing ? <p className="type-body-sm text-fg-muted">{t("noCandidates")}</p> : null}

        <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-3" aria-labelledby="suggest-typed">
          <h3 id="suggest-typed" className="text-sm font-semibold text-fg">
            {t("typed.title")}
          </h3>
          {typing ? (
            <form onSubmit={addTyped} className="flex flex-col gap-3" noValidate data-testid="typed-form">
              <p className="type-body-sm text-fg-muted">{t("typed.hint")}</p>
              <FormField label={t("typed.name")} error={draftError("name")} required>
                <Input value={draft.name} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoComplete="off" data-testid="typed-name" />
              </FormField>
              <FormField label={t("typed.profile")} hint={t("typed.profileHint")} error={draftError("profile")}>
                <Input value={draft.profile} maxLength={200} placeholder="@perfil" onChange={(e) => setDraft((d) => ({ ...d, profile: e.target.value }))} autoComplete="off" />
              </FormField>
              <FormField label={t("typed.email")} hint={t("typed.emailHint")} error={draftError("email")}>
                <Input type="email" value={draft.email} maxLength={254} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} autoComplete="off" />
              </FormField>
              {draftDup ? (
                <p role="alert" className="type-caption font-medium text-danger">
                  {t("typed.duplicate")}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" leadingIcon={<Plus />} data-testid="typed-add">
                  {t("typed.add")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => (setTyping(false), setDraftErrors({}), setDraftDup(false))}>
                  {t("typed.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="secondary" leadingIcon={<UserPlus />} onClick={() => setTyping(true)} disabled={saving} className="h-auto min-h-11 w-full whitespace-normal py-2 text-left" data-testid="typed-open">
              {t("typed.open")}
            </Button>
          )}
          {typed.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {typed.map((x) => (
                <li key={x.key} className="flex items-start gap-2 rounded-lg bg-surface-hover px-3 py-2" data-testid="typed-row">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-fg">{x.name}</span>
                      <Badge size="sm" variant="neutral">
                        {t("typed.badge")}
                      </Badge>
                    </span>
                    <span className="type-caption text-fg-muted">{[x.profile, x.email].filter(Boolean).join(" · ") || t("typed.nameOnly")}</span>
                    <span className="type-caption text-info">{t("typed.willCreate")}</span>
                  </span>
                  <IconButton icon={<X />} label={t("untick", { name: x.name })} size="sm" onClick={() => setTyped((cur) => cur.filter((y) => y.key !== x.key))} disabled={saving} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
