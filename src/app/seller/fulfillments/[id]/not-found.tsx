import { Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Remessa inexistente ou de outra organização (RLS).
export default async function FulfillmentNotFound() {
  const t = await getTranslations("seller.fulfillments.detail");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<Truck />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/seller/fulfillments">{t("backToList")}</Link>
          </Button>
        }
      />
    </div>
  );
}
