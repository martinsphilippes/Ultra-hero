import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Personalidade inexistente ou não ativa (RLS esconde perfis suspensos).
export default async function PersonalityNotFound() {
  const t = await getTranslations("discover.personalities");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<UserX />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild variant="primary">
            <Link href="/personalities">{t("profile.back")}</Link>
          </Button>
        }
      />
    </div>
  );
}
