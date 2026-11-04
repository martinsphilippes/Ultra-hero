import { MailX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Aviso curto no lugar do botão de convidar quando os convites estão pausados (0103). Serve a telas do servidor e do
// cliente (sem estado).
export function InvitesDisabledNote({ className }: { className?: string }) {
  const t = useTranslations("invites.paused");
  return (
    <p
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-border-strong px-3 py-2 type-body-sm text-fg-muted", className)}
      data-testid="invites-disabled"
      title={t("hint")}
    >
      <MailX className="size-4 shrink-0" aria-hidden="true" />
      {t("note")}
    </p>
  );
}
