import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

// Faixa do escritório sem consentimento: link público e catálogo ficam bloqueados até o aceite.
export function ConsentBanner() {
  const t = useTranslations("talent.consent");
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-warning" data-testid="consent-banner">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {t("banner")}{" "}
        <a href="/creator/escritorio/consentimento" className="font-semibold underline underline-offset-2">
          {t("bannerLink")}
        </a>
      </span>
    </p>
  );
}
