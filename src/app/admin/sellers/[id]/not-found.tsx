import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Produto ou remessa inexistente / de outra organização (as abas filtram pela organização da URL).
export default async function SellerHubNotFound() {
  const t = await getTranslations("adminOps.sellers.hub");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<SearchX />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/sellers">{t("backToSellers")}</Link>
          </Button>
        }
      />
    </div>
  );
}
