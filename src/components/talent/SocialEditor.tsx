"use client";

import { AtSign, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Dialog, FormField, Input, Select, useToast } from "@/components/ui";
import { deleteSocialAction, saveSocialAction } from "@/lib/talent/actions";
import { formatBp, formatCount } from "@/lib/talent/media-kit";
import { asOfInRange, audienceSchema, parseCount, percentToBp, type Audience } from "@/lib/talent/schemas";
import { AGE_BANDS, GENDER_KEYS, NETWORKS, UFS, type Network } from "@/lib/talent/vocab";
import { MetricSource } from "./MetricSource";

export type SocialItem = {
  id: string;
  network: Network;
  handle: string;
  url: string | null;
  followers: number | null;
  avg_views: number | null;
  avg_reach: number | null;
  engagement_bp: number | null;
  audience: unknown;
  source: "declared" | "integration";
  as_of: string;
  declared_side: "talent" | "agency" | "integration";
  updated_at: string;
};

type Props = { portal: "agency" | "office"; talentId: string; accounts: SocialItem[]; canEdit: boolean };

type Draft = {
  id: string | null;
  network: Network;
  handle: string;
  url: string;
  followers: string;
  avgViews: string;
  avgReach: string;
  engagement: string;
  asOf: string;
  gender: Record<string, string>;
  age: Record<string, string>;
  states: string;
  countries: string;
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const bpText = (bp: number | undefined) => (bp === undefined ? "" : String(bp / 100).replace(".", ","));

function toDraft(item: SocialItem | null): Draft {
  const audience = (item?.audience && typeof item.audience === "object" ? item.audience : {}) as Audience;
  return {
    id: item?.id ?? null,
    network: item?.network ?? "instagram",
    handle: item?.handle ?? "",
    url: item?.url ?? "",
    followers: item?.followers?.toString() ?? "",
    avgViews: item?.avg_views?.toString() ?? "",
    avgReach: item?.avg_reach?.toString() ?? "",
    engagement: item?.engagement_bp === null || item?.engagement_bp === undefined ? "" : bpText(item.engagement_bp),
    asOf: item?.as_of ?? today(),
    gender: Object.fromEntries(GENDER_KEYS.map((k) => [k, bpText(audience.gender?.[k])])),
    age: Object.fromEntries(AGE_BANDS.map((k) => [k, bpText(audience.age?.[k])])),
    states: (audience.top_states ?? []).join(", "),
    countries: (audience.top_countries ?? []).join(", "),
  };
}

/** Monta a audiência a partir do formulário (percentuais → pontos-base). null = algo inválido. */
function draftAudience(d: Draft): Audience | null {
  const group = (values: Record<string, string>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const bp = percentToBp(v);
      if (bp === undefined) return null;
      if (bp !== null) out[k] = bp;
    }
    return out;
  };
  const gender = group(d.gender);
  const age = group(d.age);
  if (!gender || !age) return null;
  const list = (raw: string) =>
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  const audience: Audience = {};
  if (Object.keys(gender).length > 0) audience.gender = gender;
  if (Object.keys(age).length > 0) audience.age = age;
  const states = list(d.states);
  const countries = list(d.countries);
  if (states.length > 0) audience.top_states = states as Audience["top_states"];
  if (countries.length > 0) audience.top_countries = countries;
  const parsed = audienceSchema.safeParse(audience);
  return parsed.success ? parsed.data : null;
}

// Redes declaradas (critério 2 e 3 da etapa B): cada número é "declarado" com a data do dado; vazio é
// "não informado" (nunca zero). Integração automática fica para depois (a tela diz "em breve").
export function SocialEditor({ portal, talentId, accounts, canEdit }: Props) {
  const t = useTranslations("mediaKit.social");
  const tn = useTranslations("mediaKit.networks");
  const tv = useTranslations("mediaKit.view");
  const ta = useTranslations("mediaKit.audience");
  const tc = useTranslations("common.actions");
  const locale = useLocale();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    const followers = parseCount(draft.followers);
    const avgViews = parseCount(draft.avgViews);
    const avgReach = parseCount(draft.avgReach);
    const engagementBp = percentToBp(draft.engagement);
    const audience = draftAudience(draft);
    if (followers === undefined || avgViews === undefined || avgReach === undefined || engagementBp === undefined) return setError(t("invalidNumber"));
    if (!asOfInRange(draft.asOf)) return setError(t("invalidAsOf"));
    if (!audience) return setError(t("invalidAudience"));
    start(async () => {
      const result = await saveSocialAction(portal, {
        talentId,
        id: draft.id,
        network: draft.network,
        handle: draft.handle,
        url: draft.url.trim(),
        followers,
        avgViews,
        avgReach,
        engagementBp,
        asOf: draft.asOf,
        audience,
      });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setDraft(null);
    });
  }

  function remove(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    start(async () => {
      const result = await deleteSocialAction(portal, { talentId, id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="social-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-body-sm text-fg-muted">{t("intro")}</p>
        {canEdit ? (
          <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setDraft(toDraft(null))} data-testid="social-add">
            {t("add")}
          </Button>
        ) : null}
      </div>
      <p className="rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">{t("integrationSoon")}</p>

      {accounts.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="social-item">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-fg">
                  <AtSign className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  <span className="truncate">{a.handle}</span>
                </span>
                <Badge size="sm">{tn(a.network)}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {(
                  [
                    ["followers", formatCount(a.followers, locale)],
                    ["views", formatCount(a.avg_views, locale)],
                    ["reach", formatCount(a.avg_reach, locale)],
                    ["engagement", a.engagement_bp === null ? null : formatBp(a.engagement_bp, locale)],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <dt className="text-xs text-fg-muted">{tv(key)}</dt>
                    <dd className="font-mono font-semibold text-fg">{value ?? <span className="font-sans font-normal text-fg-muted">{tv("notInformed")}</span>}</dd>
                  </div>
                ))}
              </dl>
              <MetricSource asOf={a.as_of} side={a.declared_side} declaredAt={a.updated_at} />
              {canEdit && a.source === "declared" ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" leadingIcon={<Pencil />} onClick={() => setDraft(toDraft(a))} disabled={pending}>
                    {t("edit")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => remove(a.id)} disabled={pending}>
                    {t("delete")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => (!open && !pending ? setDraft(null) : undefined)}
        title={draft?.id ? t("editTitle") : t("addTitle")}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form="social-form" loading={pending}>
              {t("save")}
            </Button>
          </>
        }
      >
        {draft ? (
          <form id="social-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("network")} required>
                <Select value={draft.network} onChange={(e) => set("network", e.target.value as Network)} disabled={pending}>
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {tn(n)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t("handle")} hint={t("handleHint")} required>
                <Input value={draft.handle} maxLength={61} autoComplete="off" onChange={(e) => set("handle", e.target.value)} disabled={pending} />
              </FormField>
            </div>
            <FormField label={t("url")} hint={t("urlHint")}>
              <Input type="url" inputMode="url" value={draft.url} onChange={(e) => set("url", e.target.value)} disabled={pending} />
            </FormField>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <FormField label={tv("followers")}>
                <Input inputMode="numeric" value={draft.followers} onChange={(e) => set("followers", e.target.value)} disabled={pending} />
              </FormField>
              <FormField label={tv("views")}>
                <Input inputMode="numeric" value={draft.avgViews} onChange={(e) => set("avgViews", e.target.value)} disabled={pending} />
              </FormField>
              <FormField label={tv("reach")}>
                <Input inputMode="numeric" value={draft.avgReach} onChange={(e) => set("avgReach", e.target.value)} disabled={pending} />
              </FormField>
              <FormField label={t("engagementPct")}>
                <Input inputMode="decimal" value={draft.engagement} onChange={(e) => set("engagement", e.target.value)} disabled={pending} />
              </FormField>
            </div>
            <FormField label={t("asOf")} hint={t("asOfHint")} required>
              <Input type="date" value={draft.asOf} max={today()} onChange={(e) => set("asOf", e.target.value)} disabled={pending} className="w-fit" />
            </FormField>
            <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-fg">{t("audienceTitle")}</legend>
              <p className="type-caption text-fg-muted">{t("audienceHint")}</p>
              <div className="grid grid-cols-3 gap-3">
                {GENDER_KEYS.map((k) => (
                  <FormField key={k} label={`${ta(`genderKeys.${k}`)} (%)`}>
                    <Input inputMode="decimal" value={draft.gender[k]} onChange={(e) => set("gender", { ...draft.gender, [k]: e.target.value })} disabled={pending} />
                  </FormField>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {AGE_BANDS.map((k) => (
                  <FormField key={k} label={`${k === "55+" ? ta("age55") : k} (%)`}>
                    <Input inputMode="decimal" value={draft.age[k]} onChange={(e) => set("age", { ...draft.age, [k]: e.target.value })} disabled={pending} />
                  </FormField>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t("topStates")} hint={t("topStatesHint", { example: UFS.slice(24, 26).join(", ") })}>
                  <Input value={draft.states} onChange={(e) => set("states", e.target.value)} disabled={pending} />
                </FormField>
                <FormField label={t("topCountries")} hint={t("topCountriesHint")}>
                  <Input value={draft.countries} onChange={(e) => set("countries", e.target.value)} disabled={pending} />
                </FormField>
              </div>
            </fieldset>
            {error ? (
              <p role="alert" className="type-body-sm text-danger">
                {error}
              </p>
            ) : null}
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
