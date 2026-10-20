"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

// Aviso educativo (não bloqueante) quando o texto sugere cura, emagrecimento garantido, diagnóstico etc.
export function HealthClaimNotice({ terms }: { terms: string[] }) {
  const t = useTranslations("editors.healthClaims");
  return (
    <div aria-live="polite">
      {terms.length > 0 && (
        <aside role="note" aria-label={t("label")} className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-fg">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t("title")}</p>
            <p className="type-body-sm">{t("description")}</p>
            <p className="type-caption text-fg-muted">{t("terms", { terms: terms.join(", ") })}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
