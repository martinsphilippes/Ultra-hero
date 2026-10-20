import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Conteúdo inexistente, arquivado ou invisível para este usuário (RLS).
export default async function ContentNotFound() {
  const t = await getTranslations("consume.content");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<Compass />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/explore">{t("backToExplore")}</Link>
          </Button>
        }
      />
    </div>
  );
}
