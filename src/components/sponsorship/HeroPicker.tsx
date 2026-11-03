"use client";

import { Check, ExternalLink, Lock, Plus, Search, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Avatar, Badge, Button, EntityCard, FormField, Input, Spinner } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { followersLabel, validateTypedHero, type TypedHeroErrors } from "@/lib/deals/hero-suggest";
import { searchOpportunityHeroesAction, type OpportunityHeroSearchResult } from "@/lib/sponsorship/actions";
import {
  choiceFromSearch,
  choiceFromTyped,
  heroPagePath,
  heroSelectable,
  mergeHeroPages,
  normalizeQuery,
  type HeroChoice,
  type OpportunityHero,
} from "@/lib/sponsorship/hero-pick";

type Props = {
  value: HeroChoice | null;
  onChange: (choice: HeroChoice | null) => void;
  /** Já há respostas das marcas: o herói não muda. */
  locked?: boolean;
  disabled?: boolean;
  /** Ação do servidor (padrão); os testes de tela trocam por dados de exemplo. */
  search?: (input: { q: string; offset?: number }) => Promise<OpportunityHeroSearchResult>;
};

// Caixa "Herói" da oportunidade de patrocínio (0095). Lê os heróis da PLATAFORMA (ativos), com busca no servidor (nome ou
// endereço), 20 por vez, e o selo: "No seu casting", "Fora do casting" (a ficha nasce ao salvar) ou indisponível ("Em outra
// agência", "Pessoa já no casting"). Alguém que não está na plataforma entra digitado (ficha só com o nome). O herói
// escolhido aparece no cartão (EntityCard) com o selo e o consentimento; trocar abre a busca de novo.
export function HeroPicker({ value, onChange, locked = false, disabled = false, search = searchOpportunityHeroesAction }: Props) {
  const t = useTranslations("sponsorship.agency.form.heroPicker");
  const tp = useTranslations("common.pillars");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(value === null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<OpportunityHero[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [searching, startSearch] = useTransition();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState({ name: "", profile: "", email: "" });
  const [draftErrors, setDraftErrors] = useState<TypedHeroErrors>({});
  const latest = useRef(0);

  // texto da busca com atraso curto: cada digitação não vira uma ida ao servidor
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(normalizeQuery(q)), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  // primeira página (e nova busca): a lista recomeça do zero; só roda com a busca aberta
  useEffect(() => {
    if (!open) return;
    const seq = ++latest.current;
    startSearch(async () => {
      const result = await search({ q: debounced, offset: 0 });
      if (seq !== latest.current) return;
      if (result.ok) {
        setItems(result.items);
        setHasMore(result.hasMore);
        setSearchError(null);
      } else {
        setItems([]);
        setHasMore(false);
        setSearchError(result.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a ação é fixa durante a vida da caixa
  }, [open, debounced, retry]);

  function loadMore() {
    const seq = ++latest.current;
    startSearch(async () => {
      const result = await search({ q: debounced, offset: items.length });
      if (seq !== latest.current) return;
      if (result.ok) {
        setItems((cur) => mergeHeroPages(cur, result.items));
        setHasMore(result.hasMore);
        setSearchError(null);
      } else {
        setSearchError(result.error);
      }
    });
  }

  function pick(hero: OpportunityHero) {
    onChange(choiceFromSearch(hero));
    setOpen(false);
    setTyping(false);
  }

  function addTyped(event: Pick<FormEvent, "preventDefault">) {
    event.preventDefault();
    const result = validateTypedHero(draft);
    if (!result.ok) return setDraftErrors(result.errors);
    onChange(choiceFromTyped(result.value));
    setDraft({ name: "", profile: "", email: "" });
    setDraftErrors({});
    setTyping(false);
    setOpen(false);
  }

  const draftError = (key: keyof TypedHeroErrors) => (draftErrors[key] ? t(`typed.errors.${key}.${draftErrors[key]}`) : undefined);

  const scopeOf = (c: HeroChoice) => (c.kind === "typed" ? "typed" : c.kind === "hero" ? "outside" : "casting");
  const summary = value ? (
    <div className="flex flex-col gap-2" data-testid="hero-chosen">
      <EntityCard
        option={{
          value: value.talentId ?? value.creatorId ?? value.name,
          name: value.name,
          avatarUrl: value.avatarUrl,
          detail: value.headline ?? (value.slug ? `/personalities/${value.slug}` : t("noPage")),
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge size="sm" variant={scopeOf(value) === "casting" ? "success" : scopeOf(value) === "outside" ? "info" : "neutral"}>
          {t(`scope.${scopeOf(value)}`)}
        </Badge>
        <Badge size="sm" variant={value.consent === "active" ? "success" : "warning"} data-testid="hero-consent-badge" data-consent={value.consent}>
          {t(`consent.${value.consent}`)}
        </Badge>
        {value.slug ? (
          <a href={heroPagePath({ slug: value.slug }) ?? "#"} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 type-caption font-medium text-accent-text underline-offset-2 hover:underline">
            {t("seePage")}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <p className="type-caption text-fg-muted">{t(`scopeHint.${scopeOf(value)}`)}</p>
      {!locked ? (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setOpen((o) => !o)} disabled={disabled} data-testid="hero-change">
          {open ? t("keep") : t("change")}
        </Button>
      ) : null}
    </div>
  ) : null;

  if (locked) return summary;

  // Enter dentro da caixa não envia o formulário da oportunidade: na busca nada acontece e no herói digitado adiciona
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
    e.preventDefault();
    if (typing) addTyped(e);
  };

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      {summary}
      {open ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid="hero-picker">
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
              disabled={disabled}
              data-testid="hero-search"
            />
          </FormField>
          {items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" aria-busy={searching} data-testid="hero-results">
              {items.map((h) => {
                const selectable = heroSelectable(h.scope);
                const followers = followersLabel(h.followers, locale);
                const chosen = value !== null && (h.kind === "talent" ? value.talentId === h.talentId : value.creatorId === h.creatorId && value.kind === "hero");
                const hintId = `hero-hint-${h.kind}-${h.talentId ?? h.creatorId}`;
                return (
                  <li key={`${h.kind}-${h.talentId ?? h.creatorId}`} data-scope={h.scope} data-testid="hero-row">
                    <button
                      type="button"
                      onClick={() => pick(h)}
                      disabled={!selectable || disabled}
                      aria-describedby={hintId}
                      aria-label={t("pick", { name: h.name })}
                      aria-pressed={chosen}
                      className="flex min-h-14 w-full items-start gap-3 p-3 text-left transition-colors enabled:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Avatar src={h.avatarUrl} name={h.name} size="sm" alt="" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-fg">{h.name}</span>
                          <Badge size="sm" variant={h.scope === "casting" ? "success" : h.scope === "outside" ? "info" : "warning"} icon={h.scope === "casting" ? <Check /> : undefined}>
                            {t(`scope.${h.scope}`)}
                          </Badge>
                          {h.kind === "talent" && h.creatorId === null ? <Badge size="sm">{t("noPage")}</Badge> : null}
                        </span>
                        {h.headline ? <span className="type-caption text-fg-muted">{h.headline}</span> : null}
                        {h.pillars.length > 0 || followers ? (
                          <span className="flex flex-wrap items-center gap-1">
                            {h.pillars.map((p) => (
                              <Badge key={p} size="sm" variant={p as "routine"}>
                                {tp(p as "routine")}
                              </Badge>
                            ))}
                            {followers ? <span className="type-caption text-fg-muted">{t("followers", { count: followers })}</span> : null}
                          </span>
                        ) : null}
                        <span id={hintId} className={`type-caption ${selectable ? "text-info" : "text-fg-muted"}`}>
                          {t(`scopeHint.${h.scope}`)}
                        </span>
                      </span>
                      {!selectable ? <Lock className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {searching && items.length === 0 ? <p className="type-body-sm text-fg-muted">{t("searching")}</p> : null}
          {items.length === 0 && !searching && !searchError ? <p className="type-body-sm text-fg-muted">{t("empty")}</p> : null}
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

          <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-3" aria-labelledby="hero-typed-title">
            <h3 id="hero-typed-title" className="text-sm font-semibold text-fg">
              {t("typed.title")}
            </h3>
            {typing ? (
              <div className="flex flex-col gap-3" data-testid="hero-typed-form">
                <p className="type-body-sm text-fg-muted">{t("typed.hint")}</p>
                <FormField label={t("typed.name")} error={draftError("name")} required>
                  <Input value={draft.name} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoComplete="off" data-testid="hero-typed-name" />
                </FormField>
                <FormField label={t("typed.profile")} hint={t("typed.profileHint")} error={draftError("profile")}>
                  <Input value={draft.profile} maxLength={200} placeholder="@perfil" onChange={(e) => setDraft((d) => ({ ...d, profile: e.target.value }))} autoComplete="off" />
                </FormField>
                <FormField label={t("typed.email")} hint={t("typed.emailHint")} error={draftError("email")}>
                  <Input type="email" value={draft.email} maxLength={254} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} autoComplete="off" />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" leadingIcon={<Plus />} onClick={addTyped} data-testid="hero-typed-use">
                    {t("typed.use")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => (setTyping(false), setDraftErrors({}))}>
                    {t("typed.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="secondary" leadingIcon={<UserPlus />} onClick={() => setTyping(true)} disabled={disabled} className="h-auto min-h-11 w-full whitespace-normal py-2 text-left" data-testid="hero-typed-open">
                {t("typed.open")}
              </Button>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
