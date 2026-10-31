import { CircleSlash, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

// Estados de acesso da página de conteúdo. A decisão vem do servidor (RLS/can_access_content);
// estes componentes só apresentam o resultado.

export function TeaserCard({ nextPath }: { nextPath: string }) {
  const t = useTranslations("consume.content");
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
      <EmptyState
        icon={<LogIn />}
        title={t("visitorTitle")}
        description={t("visitorDescription")}
        action={
          <Button asChild variant="primary" size="lg" leadingIcon={<LogIn />}>
            <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>{t("visitorCta")}</Link>
          </Button>
        }
      />
    </div>
  );
}

export function UnavailableCard() {
  const t = useTranslations("consume.content");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState icon={<CircleSlash />} title={t("unavailableTitle")} description={t("unavailableDescription")} />
    </div>
  );
}
