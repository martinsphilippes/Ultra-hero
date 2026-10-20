import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type DisclaimerKind = "general" | "training" | "nutrition" | "none" | null;

// Aviso contextual por tipo de conteúdo. `none` esconde; null cai no aviso geral.
export function DisclaimerBanner({ kind, className }: { kind: DisclaimerKind; className?: string }) {
  const t = useTranslations("consume.disclaimer");
  if (kind === "none") return null;
  const resolved = kind ?? "general";
  return (
    <aside
      role="note"
      aria-label={t("label")}
      className={cn("flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg", className)}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="type-body-sm">{t(resolved)}</p>
    </aside>
  );
}
