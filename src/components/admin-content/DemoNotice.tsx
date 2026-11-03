import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Aviso discreto para páginas com valores/pedidos: o pagamento ainda não está ativado (nada é cobrado).
// O nome do componente ficou por compatibilidade; o texto exibido não fala mais em demonstração.
export async function DemoNotice({ text }: { text?: string }) {
  const t = await getTranslations("adminContent.common");
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-fg">
      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
      <span>{text ?? t("demoNotice")}</span>
    </p>
  );
}
