"use client";

import { FilePenLine, Plus, Send, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Checkbox, DatePicker, DateRangePicker, FormField, Input, MoneyInput, NumberInput, QuantityInput, Select, Textarea, useToast } from "@/components/ui";
import { fichaLinks, formActions, publishBlock, type HeroChoice } from "@/lib/sponsorship/hero-pick";
import { parseBrlToCents } from "@/lib/deals/schemas";
import { saveSponsorshipAction, type OpportunityHeroSearchResult } from "@/lib/sponsorship/actions";
import { MAX_AMOUNT_CENTS, MAX_TIER_SLOTS, MAX_TIERS, validateTiers, type TierDraft } from "@/lib/sponsorship/negotiation";
import { MAX_PERKS, parsePerks, type SponsorshipAudience, type SponsorshipInput } from "@/lib/sponsorship/vocab";
import { NETWORKS, type Network } from "@/lib/talent/vocab";
import { AudienceFields } from "./AudienceFields";
import { HeroPicker } from "./HeroPicker";

type Option = { id: string; name: string };

export type SponsorshipFormValues = Omit<SponsorshipInput, "perks" | "tiers" | "hero" | "publish"> & { tiers: TierDraft[]; hero: HeroChoice | null };

type Props = {
  initial: SponsorshipFormValues;
  brands: Option[];
  /** Situação: nova, rascunho ou aberta (aberta só salva; nova e rascunho salvam rascunho ou publicam). */
  status?: "new" | "draft" | "open";
  /** Já há respostas: o herói não muda (as marcas responderam a ele). */
  heroLocked?: boolean;
  /** Busca de heróis (padrão: servidor); os testes de tela trocam por dados de exemplo. */
  search?: (input: { q: string; offset?: number }) => Promise<OpportunityHeroSearchResult>;
  /** Adm da agência: vê e grava o valor pedido das cotas (gestor cria sem valor; o Adm completa). */
  canValues: boolean;
  /** Cotas que já têm proposta não saem (o banco confere). */
  lockedTierIds?: string[];
};

// Oportunidade de patrocínio (0085), formulário da agência (gestor+): herói (0095), data/hora ou período, local,
// descrição, alcance, redes, prazo para responder e quem vê. 0088: cotas (1 a 3: nome, valor pedido só para o Adm,
// contrapartidas uma por linha e quantas marcas levam) e o público do evento (mesmos campos da campanha). Mobile
// first: um campo por linha no celular, botões grandes.
export function SponsorshipForm({ initial, brands, status = "new", heroLocked = false, search, canValues, lockedTierIds = [] }: Props) {
  const t = useTranslations("sponsorship.agency.form");
  const tdp = useTranslations("common.datePicker");
  const tn = useTranslations("mediaKit.networks");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof SponsorshipFormValues>(k: K, value: SponsorshipFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] => (on ? Array.from(new Set([...list, item])) : list.filter((x) => x !== item));
  const editing = Boolean(v.id);
  const actions = formActions(status);
  // consentimento: exigido só para PUBLICAR às marcas; o rascunho vale sem ele (o banco confere de novo)
  const block = publishBlock(v.hero);
  const links = fichaLinks(v.hero?.talentId ?? null);

  function submit(publish: boolean) {
    setError(null);
    const hero = v.hero;
    if (!hero) return setError(t("heroRequired"));
    if (publish && block === "consent") return setError(t("consentNotice"));
    if (v.title.trim().length < 3) return setError(t("titleRequired"));
    if (v.networks.length === 0) return setError(t("networksRequired"));
    if (v.audience === "selected" && v.brandIds.length === 0) return setError(t("brandsRequired"));
    const checked = validateTiers(v.tiers, parseBrlToCents, parsePerks, canValues);
    if (!checked.ok) {
      const n = checked.index + 1;
      if (checked.error === "count") return setError(t("tiers.errors.count", { max: MAX_TIERS }));
      if (checked.error === "perks") return setError(t("tiers.errors.perks", { n, max: MAX_PERKS }));
      return setError(t(`tiers.errors.${checked.error}`, { n, max: MAX_TIER_SLOTS }));
    }
    const rest: Partial<SponsorshipFormValues> = { ...v };
    delete rest.tiers;
    delete rest.hero;
    start(async () => {
      const result = await saveSponsorshipAction({ ...(rest as Omit<SponsorshipFormValues, "tiers" | "hero">), hero, publish, perks: [], tiers: checked.tiers });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push(`/agencia/oportunidades/${result.id ?? v.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={(event) => {
        // Enter nunca publica: salva (rascunho, ou a aberta que já está publicada)
        event.preventDefault();
        submit(false);
      }} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" noValidate data-testid="sponsorship-form">
      <div role="group" aria-labelledby="sponsorship-hero-label" aria-describedby="sponsorship-hero-hint" className="flex flex-col gap-1.5" data-testid="sponsorship-hero">
        <span id="sponsorship-hero-label" className="text-sm font-semibold text-fg">
          {t("hero")}
          <span aria-hidden="true" className="ml-0.5 text-accent-text">
            *
          </span>
        </span>
        <HeroPicker value={v.hero} onChange={(hero) => set("hero", hero)} locked={heroLocked} disabled={pending} search={search} />
        <p id="sponsorship-hero-hint" className="type-caption text-fg-muted">
          {heroLocked ? t("heroLocked") : t("heroHint")}
        </p>
      </div>
      {block === "consent" && status !== "open" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft/40 px-3 py-2" role="status" data-testid="hero-consent-notice">
          <p className="flex items-start gap-2 type-body-sm text-fg">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{t("consentNotice")}</span>
          </p>
          {links ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href={links.ficha} className="inline-flex min-h-8 items-center type-caption font-medium text-accent-text underline-offset-2 hover:underline">
                {t("openFicha")}
              </Link>
              <Link href={links.documents} className="inline-flex min-h-8 items-center type-caption font-medium text-accent-text underline-offset-2 hover:underline">
                {t("openDocuments")}
              </Link>
            </span>
          ) : (
            <p className="type-caption text-fg-muted">{t("consentNoticeNew")}</p>
          )}
        </div>
      ) : null}
      <FormField label={t("title")} required>
        <Input value={v.title} maxLength={120} placeholder={t("titlePlaceholder")} onChange={(e) => set("title", e.target.value)} disabled={pending} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField label={tdp("period")} required className="sm:col-span-2">
          <DateRangePicker start={v.date} end={v.endDate} onChange={(a, b) => setV((cur) => ({ ...cur, date: a, endDate: b }))} disabled={pending} data-testid="sponsorship-period" />
        </FormField>
        <FormField label={t("startTime")}>
          <Input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} disabled={pending || v.allDay} />
        </FormField>
        <FormField label={t("endTime")}>
          <Input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={pending || v.allDay} />
        </FormField>
      </div>
      <Checkbox label={t("allDay")} checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} disabled={pending} />
      <FormField label={t("location")}>
        <Input value={v.location} maxLength={200} placeholder={t("locationPlaceholder")} onChange={(e) => set("location", e.target.value)} disabled={pending} />
      </FormField>
      <FormField label={t("description")} hint={t("descriptionHint")}>
        <Textarea value={v.description} maxLength={2000} rows={3} onChange={(e) => set("description", e.target.value)} disabled={pending} />
      </FormField>
      <FormField label={t("reach")} hint={t("reachHint")}>
        {/* só números (pedido do responsável, 04/11): ponto de milhar enquanto digita, guardado como "5.000" */}
        <NumberInput value={v.expectedReach} max={999_999_999} placeholder={t("reachPlaceholder")} onValueChange={(text) => set("expectedReach", text)} disabled={pending} />
      </FormField>
      <fieldset className="flex flex-col gap-3" data-testid="sponsorship-tiers">
        <legend className="mb-1 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">{t("tiers.title")}</span>
          <span className="type-caption text-fg-muted">{canValues ? t("tiers.hintAdmin") : t("tiers.hintManager")}</span>
        </legend>
        {v.tiers.map((tier, i) => {
          const setTier = (patch: Partial<TierDraft>) => set("tiers", v.tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          const locked = tier.id !== null && lockedTierIds.includes(tier.id);
          return (
            <div key={tier.id ?? `new-${i}`} className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid="sponsorship-tier">
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem_7rem]">
                <FormField label={t("tiers.name")} required>
                  <Input value={tier.name} maxLength={40} placeholder={t("tiers.namePlaceholder")} onChange={(e) => setTier({ name: e.target.value })} disabled={pending} />
                </FormField>
                {canValues ? (
                  <FormField label={t("tiers.price")} hint={t("tiers.priceHint")}>
                    <MoneyInput value={tier.priceText} maxCents={MAX_AMOUNT_CENTS} onValueChange={(text) => setTier({ priceText: text })} disabled={pending} data-testid="sponsorship-tier-price" />
                  </FormField>
                ) : (
                  <FormField label={t("tiers.price")}>
                    <p className="flex min-h-11 items-center type-body-sm text-fg-muted">{t("tiers.priceByAdmin")}</p>
                  </FormField>
                )}
                <FormField label={t("tiers.slots")}>
                  <QuantityInput min={1} max={MAX_TIER_SLOTS} value={tier.slots} onValueChange={(n) => setTier({ slots: n })} disabled={pending} />
                </FormField>
              </div>
              <FormField label={t("tiers.perks")} hint={t("perksHint", { max: MAX_PERKS })}>
                <Textarea value={tier.perksText} rows={3} placeholder={t("perksPlaceholder")} onChange={(e) => setTier({ perksText: e.target.value })} disabled={pending} />
              </FormField>
              {v.tiers.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" leadingIcon={<Trash2 />} className="self-start" onClick={() => set("tiers", v.tiers.filter((_, j) => j !== i))} disabled={pending || locked}>
                  {locked ? t("tiers.locked") : t("tiers.remove")}
                </Button>
              ) : null}
            </div>
          );
        })}
        {v.tiers.length < MAX_TIERS ? (
          <Button type="button" variant="secondary" leadingIcon={<Plus />} className="self-start" onClick={() => set("tiers", [...v.tiers, { id: null, name: "", priceText: "", perksText: "", slots: 1 }])} disabled={pending}>
            {t("tiers.add")}
          </Button>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold text-fg">{t("publicTitle")}</legend>
        <p className="type-caption text-fg-muted">{t("publicHint")}</p>
        <AudienceFields idPrefix="sponsorship" value={v.public} onChange={(next) => set("public", next)} disabled={pending} />
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-fg">{t("networks")}</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          {NETWORKS.map((n) => (
            <Checkbox
              key={n}
              label={tn(n)}
              checked={v.networks.includes(n)}
              onChange={(e) => set("networks", toggle<Network>(v.networks as Network[], n, e.target.checked))}
              disabled={pending}
            />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("respondDate")} hint={t("respondHint")} required>
          <DatePicker value={v.respondDate} max={v.endDate || v.date} onChange={(value) => set("respondDate", value)} disabled={pending} />
        </FormField>
        <FormField label={t("respondTime")} required>
          <Input type="time" value={v.respondTime} onChange={(e) => set("respondTime", e.target.value)} disabled={pending} />
        </FormField>
      </div>
      <FormField label={t("audience")}>
        <Select value={v.audience} onChange={(e) => set("audience", e.target.value as SponsorshipAudience)} disabled={pending}>
          <option value="all">{t("audienceAll")}</option>
          <option value="selected">{t("audienceSelected")}</option>
        </Select>
      </FormField>
      {v.audience === "selected" ? (
        <fieldset className="flex flex-col gap-1" data-testid="sponsorship-brands">
          <legend className="mb-1 text-sm font-medium text-fg">{t("brands")}</legend>
          {brands.length === 0 ? <p className="type-caption text-fg-muted">{t("noBrands")}</p> : null}
          <div className="grid gap-x-3 sm:grid-cols-2">
            {brands.map((b) => (
              <Checkbox key={b.id} label={b.name} checked={v.brandIds.includes(b.id)} onChange={(e) => set("brandIds", toggle(v.brandIds, b.id, e.target.checked))} disabled={pending} />
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="type-caption text-fg-muted">{canValues ? t("valuesAdmin") : t("valuesManager")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()} disabled={pending}>
          {t("back")}
        </Button>
        {actions.save ? (
          <Button type="button" size="lg" leadingIcon={<Send />} onClick={() => submit(false)} disabled={pending} data-testid="sponsorship-submit">
            {t("submitEdit")}
          </Button>
        ) : null}
        {actions.saveDraft ? (
          <Button type="button" variant="secondary" size="lg" leadingIcon={<FilePenLine />} onClick={() => submit(false)} disabled={pending} data-testid="sponsorship-save-draft">
            {t("saveDraft")}
          </Button>
        ) : null}
        {actions.publish ? (
          <Button type="button" size="lg" leadingIcon={<Send />} onClick={() => submit(true)} disabled={pending || block === "consent"} data-testid="sponsorship-submit">
            {editing ? t("publishDraft") : t("submitNew")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
