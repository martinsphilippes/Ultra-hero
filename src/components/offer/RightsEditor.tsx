"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Checkbox, FormField, Input, SegmentedControl, Textarea } from "@/components/ui";
import { MAX_EXCLUSIVITY_MONTHS, MAX_USAGE_MONTHS, USAGE_CHANNELS, parseCompetitors, type Rights, type UsageChannel } from "@/lib/offer/rights";

type Mode = "months" | "perpetual" | "none";

// Editor dos direitos de uso e exclusividade (agência, no formulário dos termos). Controlado pelo pai.
export function RightsEditor({ value, onChange, segments, disabled = false }: { value: Rights; onChange: (r: Rights) => void; segments: { id: string; name: string }[]; disabled?: boolean }) {
  const t = useTranslations("offer.editor");
  const tr = useTranslations("offer.rights");
  const [competitorsText, setCompetitorsText] = useState(value.competitors.join(", "));
  const mode: Mode = value.perpetual ? "perpetual" : value.usageMonths !== null ? "months" : "none";
  const set = (patch: Partial<Rights>) => onChange({ ...value, ...patch });
  const toggleChannel = (c: UsageChannel, on: boolean) => set({ channels: on ? Array.from(new Set([...value.channels, c])) : value.channels.filter((x) => x !== c) });
  const toggleSegment = (id: string, on: boolean) => set({ segmentIds: on ? Array.from(new Set([...value.segmentIds, id])) : value.segmentIds.filter((x) => x !== id) });
  const intOrNull = (raw: string) => (/^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim()) : null);

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3" disabled={disabled} data-testid="rights-editor">
      <legend className="px-1 text-sm font-semibold text-fg">{t("title")}</legend>
      <div className="flex flex-col gap-1.5">
        <span className="type-caption text-fg-muted">{t("channels")}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {USAGE_CHANNELS.map((c) => (
            <Checkbox key={c} label={tr(`channels.${c}`)} checked={value.channels.includes(c)} onChange={(e) => toggleChannel(c, e.target.checked)} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="type-caption text-fg-muted">{t("usageMode")}</span>
        <SegmentedControl<Mode>
          aria-label={t("usageMode")}
          size="sm"
          value={mode}
          onValueChange={(m) => set(m === "perpetual" ? { perpetual: true, usageMonths: null } : m === "months" ? { perpetual: false, usageMonths: value.usageMonths ?? 12 } : { perpetual: false, usageMonths: null })}
          options={[
            { value: "months", label: t("modeMonths") },
            { value: "perpetual", label: t("modePerpetual") },
            { value: "none", label: t("modeNone") },
          ]}
        />
        {mode === "months" ? (
          <FormField label={t("months")}>
            <Input type="number" inputMode="numeric" min={1} max={MAX_USAGE_MONTHS} value={value.usageMonths ?? ""} onChange={(e) => set({ usageMonths: intOrNull(e.target.value) })} className="max-w-[8rem]" />
          </FormField>
        ) : null}
        {mode === "perpetual" ? (
          <p className="flex items-start gap-1.5 type-caption text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {tr("perpetualWarning")}
          </p>
        ) : null}
      </div>
      <Checkbox label={t("boost")} checked={value.boost} onChange={(e) => set({ boost: e.target.checked })} />
      <Checkbox
        label={t("exclusive")}
        checked={value.exclusive}
        onChange={(e) => set(e.target.checked ? { exclusive: true, exclusivityMonths: value.exclusivityMonths ?? 3 } : { exclusive: false })}
        data-testid="rights-exclusive"
      />
      {value.exclusive ? (
        <div className="flex flex-col gap-3 border-l-2 border-warning/40 pl-3">
          <FormField label={t("exclusivityMonths")} hint={t("exclusivityMonthsHint")} required>
            <Input type="number" inputMode="numeric" min={1} max={MAX_EXCLUSIVITY_MONTHS} value={value.exclusivityMonths ?? ""} onChange={(e) => set({ exclusivityMonths: intOrNull(e.target.value) })} className="max-w-[8rem]" />
          </FormField>
          {segments.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="type-caption text-fg-muted">{t("segments")}</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {segments.map((s) => (
                  <Checkbox key={s.id} label={s.name} checked={value.segmentIds.includes(s.id)} onChange={(e) => toggleSegment(s.id, e.target.checked)} />
                ))}
              </div>
              <span className="type-caption text-fg-muted">{t("segmentsHint")}</span>
            </div>
          ) : null}
          <FormField label={t("category")} hint={t("categoryHint")}>
            <Input value={value.category} maxLength={120} onChange={(e) => set({ category: e.target.value })} />
          </FormField>
          <FormField label={t("competitors")} hint={t("competitorsHint")}>
            <Textarea
              value={competitorsText}
              rows={2}
              maxLength={1800}
              onChange={(e) => {
                setCompetitorsText(e.target.value);
                set({ competitors: parseCompetitors(e.target.value) });
              }}
            />
          </FormField>
        </div>
      ) : null}
    </fieldset>
  );
}
