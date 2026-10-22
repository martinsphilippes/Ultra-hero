"use client";

import { useTranslations } from "next-intl";
import { setReviewRequiredAction } from "@/app/admin/content-actions";
import { ConfirmActionDialog, StatusBadge } from "@/components/admin";

type Row = { type: "video" | "recipe" | "workout" | "guide" | "article"; on: boolean };

// "Exigir revisão" por tipo (P1, desligada por padrão): cada mudança passa por
// admin_set_review_required, com justificativa obrigatória e registro em admin_audit.
export function ReviewRequiredSettings({ rows }: { rows: Row[] }) {
  const t = useTranslations("recipes.admin");
  const tc = useTranslations("adminContent.common");
  const ts = useTranslations("adminContent.content.typeSettings");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface" data-testid="review-required-settings">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("reviewCaption")}</caption>
        <thead className="bg-surface-elevated">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {ts("type")}
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {t("reviewColumn")}
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-fg-muted">
              <span className="sr-only">{t("turnOn")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const typeLabel = tc(`types.${row.type}`);
            return (
              <tr key={row.type} data-type={row.type}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-fg">
                  {typeLabel}
                </th>
                <td className="px-4 py-3">
                  <StatusBadge status={row.on ? "in_review" : "none"} label={row.on ? t("reviewOn") : t("reviewOff")} />
                </td>
                <td className="px-4 py-2 text-right">
                  <ConfirmActionDialog
                    triggerLabel={row.on ? t("turnOff") : t("turnOn")}
                    title={row.on ? t("confirmOffTitle", { type: typeLabel }) : t("confirmOnTitle", { type: typeLabel })}
                    description={t("confirmDescription")}
                    requireJustification
                    action={(justification) => setReviewRequiredAction(row.type, !row.on, justification)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
