"use client";

import { CheckCircle2, ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Checkbox } from "@/components/ui";
import { itemFromKey, missingChecks, type CheckItem, type CheckSide } from "@/lib/brief/brief";

/** Texto de um item do checklist (os padrão mudam de voz: a marca confere, o influenciador afirma). */
export function useCheckLabel(side: CheckSide) {
  const t = useTranslations("brief.checklist");
  return (item: CheckItem): string => {
    if (item.kind === "standard") return side === "brand" ? t(`brand.${item.code}`) : t(`talent.${item.code as "ad_label" | "brand_mention" | "follows_brief"}`);
    if (item.kind === "donts") return t("donts");
    if (item.kind === "extra") return item.value;
    return t(item.kind, { value: item.value });
  };
}

type Props = { side: CheckSide; items: CheckItem[]; checked: Set<string>; onToggle: (key: string, on: boolean) => void; disabled?: boolean };

// Checklist de publicidade (marca, para aprovar) ou do influenciador (para enviar), 0080. O banco confere de novo.
export function ChecklistFieldset({ side, items, checked, onToggle, disabled }: Props) {
  const t = useTranslations("brief.checklist");
  const label = useCheckLabel(side);
  const id = useId();
  const missing = missingChecks(items, checked).length;
  return (
    <fieldset className="flex flex-col gap-1 rounded-xl border border-border p-3" data-testid={`checklist-${side}`}>
      <legend className="px-1 text-sm font-semibold text-fg">{side === "brand" ? t("brandTitle") : t("talentTitle")}</legend>
      <p className="type-caption text-fg-muted">{side === "brand" ? t("brandHint") : t("talentHint")}</p>
      <ul className="flex flex-col">
        {items.map((item, i) => (
          <li key={item.key}>
            <Checkbox id={`${id}-${i}`} label={<span className="break-words">{label(item)}</span>} checked={checked.has(item.key)} onChange={(e) => onToggle(item.key, e.target.checked)} disabled={disabled} />
          </li>
        ))}
      </ul>
      <p className={`type-caption ${missing === 0 ? "text-success" : "text-fg-muted"}`} aria-live="polite">
        {missing === 0 ? t("allDone") : t("missing", { count: missing })}
      </p>
    </fieldset>
  );
}

/** Checklist conferido gravado numa versão (só leitura). */
export function ChecklistRecord({ side, keys }: { side: CheckSide; keys: string[] }) {
  const t = useTranslations("brief.checklist");
  const label = useCheckLabel(side);
  return (
    <details className="group" data-testid={`checklist-record-${side}`}>
      <summary className="inline-flex cursor-pointer items-center gap-1 text-success">
        {side === "brand" ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <ListChecks className="size-3.5" aria-hidden="true" />}
        {side === "brand" ? t("recordedBrand", { count: keys.length }) : t("recordedTalent", { count: keys.length })}
        <span className="text-fg-muted underline-offset-2 group-open:hidden hover:underline"> · {t("show")}</span>
      </summary>
      <ul className="mt-1 list-disc pl-5">
        {keys.map((k) => (
          <li key={k} className="break-words">
            {label(itemFromKey(k))}
          </li>
        ))}
      </ul>
    </details>
  );
}
