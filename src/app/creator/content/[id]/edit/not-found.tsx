import { FileQuestion } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Conteúdo inexistente ou de outra personalidade (RLS não devolve).
export default async function ContentNotFound() {
  const [t, tn] = await Promise.all([getTranslations("creator.edit"), getTranslations("nav")]);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<FileQuestion />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="secondary">
            <Link href="/creator/content">{tn("creator.content")}</Link>
          </Button>
        }
      />
    </div>
  );
}
