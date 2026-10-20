"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { setLocaleAction } from "@/i18n/actions";
import { isLocale, locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = { className?: string; variant?: "icon" | "full" };

// Seletor de idioma: <select> nativo (acessível e leve), ícone no modo compacto.
export function LocaleSwitcher({ className, variant = "icon" }: LocaleSwitcherProps) {
  const locale = useLocale();
  const t = useTranslations("common.languages");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onChange = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    startTransition(async () => {
      await setLocaleAction(value);
      router.refresh();
    });
  };

  return (
    <label
      className={cn(
        "relative inline-flex min-h-11 items-center gap-2 rounded-lg text-fg transition-colors hover:bg-surface-hover focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
        variant === "icon" ? "size-11 justify-center" : "border border-border-strong bg-surface px-3",
        pending && "opacity-60",
        className,
      )}
    >
      <Languages className="size-5 shrink-0" aria-hidden="true" />
      {variant === "icon" ? <VisuallyHidden>{t("label")}</VisuallyHidden> : <span className="text-sm font-medium">{t("label")}</span>}
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t("label")}
        className={cn(
          "cursor-pointer bg-transparent text-sm font-medium text-fg focus:outline-none",
          variant === "icon" && "absolute inset-0 appearance-none opacity-0",
        )}
      >
        {locales.map((code) => (
          <option key={code} value={code} className="bg-surface text-fg">
            {t(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
