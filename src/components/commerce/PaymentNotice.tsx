import { useTranslations } from "next-intl";
import { DemoNotice } from "./DemoNotice";

// Aviso único e discreto onde o usuário finaliza ou acompanha um pedido (decisão do responsável, 11/2026):
// o pagamento ainda não está ativado e o pedido é registrado sem cobrança. Nada de "demonstração".
export function PaymentNotice({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <DemoNotice tone="info" className={className}>
      <span data-testid="payment-notice">{t("paymentsInactive")}</span>
    </DemoNotice>
  );
}
