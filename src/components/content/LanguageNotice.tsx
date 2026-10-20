import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LocaleCode } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";

// Aviso quando o conteúdo está no idioma original (sem tradução publicada para a UI).
export function LanguageNotice({ sourceLocale, className }: { sourceLocale: LocaleCode; className?: string }) {
  const t = useTranslations("common.languages");
  return (
    <p className={cn("flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 type-caption text-fg-muted", className)} role="note">
      <Languages className="size-4 shrink-0" aria-hidden="true" />
      {t("untranslated", { language: t(sourceLocale) })}
    </p>
  );
}
