import { getTranslations } from "next-intl/server";
import { DemoBadge } from "@/components/ui";

// Aviso de demonstração para páginas com valores/pedidos (nada é real).
export async function DemoNotice({ text }: { text?: string }) {
  const t = await getTranslations("adminContent.common");
  return (
    <p role="note" className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-fg">
      <DemoBadge size="sm" />
      <span>{text ?? t("demoNotice")}</span>
    </p>
  );
}
