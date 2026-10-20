import { FileQuestion } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

export default async function OrderNotFound() {
  const t = await getTranslations("adminContent.common");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<FileQuestion />}
        title={t("notFound")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/orders">{t("backToList")}</Link>
          </Button>
        }
      />
    </div>
  );
}
