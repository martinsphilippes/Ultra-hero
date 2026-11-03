"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, DatePicker, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { saveSponsorshipAction } from "@/lib/sponsorship/actions";
import { MAX_PERKS, parsePerks, perksValid, type SponsorshipAudience, type SponsorshipInput } from "@/lib/sponsorship/vocab";
import { NETWORKS, type Network } from "@/lib/talent/vocab";

type Option = { id: string; name: string };

export type SponsorshipFormValues = Omit<SponsorshipInput, "perks"> & { perksText: string };

type Props = {
  initial: SponsorshipFormValues;
  talents: Option[];
  brands: Option[];
  /** Já há respostas: o creator não muda (as marcas responderam a ele). */
  talentLocked?: boolean;
};

// Oportunidade de patrocínio (0085), formulário da agência (gestor+): creator, data/hora ou período, local,
// descrição, alcance, o que a marca recebe (uma por linha), redes, prazo para responder e quem vê. Mobile first:
// um campo por linha no celular, botões grandes. Sem valores (a proposta comercial segue na campanha).
export function SponsorshipForm({ initial, talents, brands, talentLocked = false }: Props) {
  const t = useTranslations("sponsorship.agency.form");
  const tn = useTranslations("mediaKit.networks");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof SponsorshipFormValues>(k: K, value: SponsorshipFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] => (on ? Array.from(new Set([...list, item])) : list.filter((x) => x !== item));
  const editing = Boolean(v.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!v.talentId) return setError(t("talentRequired"));
    if (v.title.trim().length < 3) return setError(t("titleRequired"));
    if (v.networks.length === 0) return setError(t("networksRequired"));
    if (v.audience === "selected" && v.brandIds.length === 0) return setError(t("brandsRequired"));
    const perks = parsePerks(v.perksText);
    if (!perksValid(perks)) return setError(t("perksInvalid", { max: MAX_PERKS }));
    const rest: Partial<SponsorshipFormValues> = { ...v };
    delete rest.perksText;
    start(async () => {
      const result = await saveSponsorshipAction({ ...(rest as Omit<SponsorshipFormValues, "perksText">), perks });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push(`/agencia/oportunidades/${result.id ?? v.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" noValidate data-testid="sponsorship-form">
      <FormField label={t("talent")} hint={talentLocked ? t("talentLocked") : t("talentHint")} required>
        <Select value={v.talentId} onChange={(e) => set("talentId", e.target.value)} disabled={pending || talentLocked}>
          <option value="">—</option>
          {talents.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </FormField>
      {talents.length === 0 ? <p className="type-caption text-warning">{t("noTalents")}</p> : null}
      <FormField label={t("title")} required>
        <Input value={v.title} maxLength={120} placeholder={t("titlePlaceholder")} onChange={(e) => set("title", e.target.value)} disabled={pending} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField label={t("date")} required>
          <DatePicker value={v.date} onChange={(value) => set("date", value)} disabled={pending} />
        </FormField>
        <FormField label={t("endDate")}>
          <DatePicker value={v.endDate} min={v.date} onChange={(value) => set("endDate", value)} disabled={pending} />
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
      <FormField label={t("reach")}>
        <Input value={v.expectedReach} maxLength={160} placeholder={t("reachPlaceholder")} onChange={(e) => set("expectedReach", e.target.value)} disabled={pending} />
      </FormField>
      <FormField label={t("perks")} hint={t("perksHint", { max: MAX_PERKS })}>
        <Textarea value={v.perksText} rows={4} placeholder={t("perksPlaceholder")} onChange={(e) => set("perksText", e.target.value)} disabled={pending} />
      </FormField>
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
      <p className="type-caption text-fg-muted">{t("noValues")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()} disabled={pending}>
          {t("back")}
        </Button>
        <Button type="submit" size="lg" leadingIcon={<Send />} disabled={pending || talents.length === 0} data-testid="sponsorship-submit">
          {editing ? t("submitEdit") : t("submitNew")}
        </Button>
      </div>
    </form>
  );
}
