import { ListX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Lista inexistente ou de outra pessoa (RLS): mesma resposta para não vazar existência.
export default async function ListNotFound() {
  const t = await getTranslations("discover.explore.lists");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<ListX />}
        title={t("errors.notFound")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/explore?tab=listas">{t("backToLists")}</Link>
          </Button>
        }
      />
    </div>
  );
}
