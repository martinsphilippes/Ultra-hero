import { ReceiptText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Pedido inexistente, anonimizado ou de outra conta (RLS).
export default async function OrderNotFound() {
  const t = await getTranslations("commerce.orders.detail");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<ReceiptText />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/orders">{t("backToOrders")}</Link>
          </Button>
        }
      />
    </div>
  );
}
