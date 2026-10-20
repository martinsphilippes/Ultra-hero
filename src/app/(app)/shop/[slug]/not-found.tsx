import { PackageSearch } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Produto inexistente, arquivado ou invisível para este usuário (RLS).
export default async function ProductNotFound() {
  const t = await getTranslations("commerce.product");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<PackageSearch />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/shop">{t("backToShop")}</Link>
          </Button>
        }
      />
    </div>
  );
}
