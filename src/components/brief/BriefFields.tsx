"use client";

import { useTranslations } from "next-intl";
import { FormField, Input, Textarea } from "@/components/ui";
import { ChecklistEditor } from "./ChecklistEditor";
import { invalidEntries, MAX_COUPON, MAX_DONTS, type BriefDraft } from "@/lib/brief/brief";

type Props = { value: BriefDraft; onChange: (next: BriefDraft) => void; disabled?: boolean };

// Campos do briefing estruturado (0080): texto livre que vira lista (o app completa # e @ e tira repetidos);
// o que não serve aparece logo abaixo para quem digita corrigir.
export function BriefFields({ value, onChange, disabled }: Props) {
  const t = useTranslations("brief");
  const set = <K extends keyof BriefDraft>(k: K, v: BriefDraft[K]) => onChange({ ...value, [k]: v });
  const bad = (kind: "hashtags" | "mentions" | "links", text: string) => {
    const items = invalidEntries(text, kind);
    return items.length > 0 ? t("invalid", { items: items.join(", ") }) : undefined;
  };
  return (
    <div className="flex flex-col gap-4" data-testid="brief-fields">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("fields.hashtags")} hint={t("fields.hashtagsHint")} error={bad("hashtags", value.hashtags)}>
          <Input value={value.hashtags} maxLength={1000} onChange={(e) => set("hashtags", e.target.value)} disabled={disabled} autoCapitalize="none" spellCheck={false} />
        </FormField>
        <FormField label={t("fields.mentions")} hint={t("fields.mentionsHint")} error={bad("mentions", value.mentions)}>
          <Input value={value.mentions} maxLength={1000} onChange={(e) => set("mentions", e.target.value)} disabled={disabled} autoCapitalize="none" spellCheck={false} />
        </FormField>
        <FormField label={t("fields.coupon")} hint={t("fields.couponHint")}>
          <Input value={value.coupon} maxLength={MAX_COUPON + 10} onChange={(e) => set("coupon", e.target.value)} disabled={disabled} autoCapitalize="characters" spellCheck={false} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("fields.links")} hint={t("fields.linksHint")} error={bad("links", value.links)}>
          <Textarea value={value.links} maxLength={6000} rows={2} onChange={(e) => set("links", e.target.value)} disabled={disabled} spellCheck={false} />
        </FormField>
        <FormField label={t("fields.references")} hint={t("fields.referencesHint")} error={bad("links", value.references)}>
          <Textarea value={value.references} maxLength={6000} rows={2} onChange={(e) => set("references", e.target.value)} disabled={disabled} spellCheck={false} />
        </FormField>
      </div>
      <FormField label={t("fields.donts")} hint={t("fields.dontsHint")}>
        <Textarea value={value.donts} maxLength={MAX_DONTS} rows={2} onChange={(e) => set("donts", e.target.value)} disabled={disabled} />
      </FormField>
      <FormField label={t("fields.checks")} hint={t("fields.checksHint")}>
        <ChecklistEditor value={value.checks} onChange={(v) => set("checks", v)} disabled={disabled} />
      </FormField>
    </div>
  );
}
