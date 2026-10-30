"use client";

import { FlaskConical, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DEMO_BANNER_COOKIE } from "@/lib/theme/constants";

type DemoBannerProps = { initiallyDismissed?: boolean };

// Aviso permanente de ambiente demonstrativo. Dispensa guardada em cookie (sem flash).
export function DemoBanner({ initiallyDismissed = false }: DemoBannerProps) {
  const t = useTranslations("common.demo");
  const [dismissed, setDismissed] = useState(initiallyDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    document.cookie = `${DEMO_BANNER_COOKIE}=1; path=/; max-age=${60 * 60 * 24}; samesite=lax`;
  };

  return (
    <div role="status" className="border-b border-warning/30 bg-warning-soft text-fg native:hidden">
      <div className="mx-auto flex max-w-content items-center gap-3 px-gutter py-2">
        <FlaskConical className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="type-caption flex-1 text-balance">{t("banner")}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
