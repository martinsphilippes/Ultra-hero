import { Package } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Produto inexistente ou de outra organização (RLS).
export default async function ProductEditNotFound() {
  const t = await getTranslations("seller.products");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<Package />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/seller/products">{t("backToList")}</Link>
          </Button>
        }
      />
    </div>
  );
}
