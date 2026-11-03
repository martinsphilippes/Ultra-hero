"use client";

import { useTranslations } from "next-intl";
import { Checkbox, FormField, Input, Textarea } from "@/components/ui";
import type { SponsorshipPublic } from "@/lib/sponsorship/negotiation";
import { AGE_BANDS, UFS } from "@/lib/talent/vocab";

type Props = { value: SponsorshipPublic; onChange: (next: SponsorshipPublic) => void; disabled?: boolean; idPrefix: string };

// Público (0088): os MESMOS campos e valores da seção "Público" da campanha da marca (CampaignForm, mesmos textos de
// brandPortal.campaigns.form): público-alvo, faixas etárias, UFs e detalhe da região. Serve à oportunidade (agência)
// e ao "público que me interessa" da proposta da marca.
export function AudienceFields({ value, onChange, disabled = false, idPrefix }: Props) {
  const t = useTranslations("brandPortal.campaigns.form");
  const set = <K extends keyof SponsorshipPublic>(k: K, v: SponsorshipPublic[K]) => onChange({ ...value, [k]: v });
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] => (on ? Array.from(new Set([...list, item])) : list.filter((x) => x !== item));
  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-audience`}>
      <FormField label={t("audience")} hint={t("audienceHint")}>
        <Textarea value={value.targetAudience} maxLength={500} rows={2} onChange={(e) => set("targetAudience", e.target.value)} disabled={disabled} />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-fg">{t("ageBands")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {AGE_BANDS.map((a) => (
            <Checkbox key={a} label={a} checked={value.targetAgeBands.includes(a)} onChange={(e) => set("targetAgeBands", toggle(value.targetAgeBands, a, e.target.checked))} disabled={disabled} />
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-fg">{t("states")}</legend>
        <div className="grid grid-cols-4 gap-x-3 gap-y-1 sm:grid-cols-7 lg:grid-cols-9">
          {UFS.map((uf) => (
            <Checkbox key={uf} label={uf} checked={value.targetStates.includes(uf)} onChange={(e) => set("targetStates", toggle(value.targetStates, uf, e.target.checked))} disabled={disabled} />
          ))}
        </div>
      </fieldset>
      <FormField label={t("regionNote")}>
        <Input value={value.regionNote} maxLength={200} onChange={(e) => set("regionNote", e.target.value)} disabled={disabled} />
      </FormField>
    </div>
  );
}
