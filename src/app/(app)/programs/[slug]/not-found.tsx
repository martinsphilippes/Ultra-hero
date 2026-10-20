import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Programa inexistente ou não publicado (RLS).
export default async function ProgramNotFound() {
  const t = await getTranslations("consume.program");
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
