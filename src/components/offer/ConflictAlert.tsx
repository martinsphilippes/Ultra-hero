import { ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { Conflict } from "@/lib/offer/counteroffer";

// Alerta de exclusividade vigente (0079): não bloqueia; mostra marca, até quando e por quê (segmento ou concorrente).
export function ConflictAlert({ conflicts, side, compact = false }: { conflicts: Conflict[]; side: "agency" | "talent"; compact?: boolean }) {
  const t = useTranslations("offer.conflict");
  const locale = useLocale() as Locale;
  if (conflicts.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-xl border border-warning/40 bg-warning-soft/40 px-3 py-2" data-testid="exclusivity-conflict">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
        {side === "talent" ? t("talentTitle") : t("title")}
      </p>
      <ul className="flex flex-col gap-1">
        {conflicts.map((c) => (
          <li key={c.dealId} className="type-caption text-fg">
            <span className="font-medium">{c.until ? t("item", { brand: c.brandName, date: formatPlainDate(c.until, locale) }) : t("itemNoDate", { brand: c.brandName })}</span>
            {c.segments.length > 0 ? ` · ${t("bySegment", { segments: c.segments.join(", ") })}` : ""}
            {c.competitor ? ` · ${t("byCompetitor")}` : ""}
            {c.category ? ` · ${t("category", { category: c.category })}` : ""}
          </li>
        ))}
      </ul>
      {!compact ? <p className="type-caption text-fg-muted">{side === "talent" ? t("talentHint") : t("agencyHint")}</p> : null}
    </div>
  );
}
