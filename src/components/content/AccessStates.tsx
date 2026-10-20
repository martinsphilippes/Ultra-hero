import { CircleSlash, LockKeyhole, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Button, DemoBadge, EmptyState } from "@/components/ui";

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

export function LockCard({ moduleName }: { moduleName: string }) {
  const t = useTranslations("consume.content");
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/40">
      <EmptyState
        icon={<LockKeyhole />}
        title={t("lockTitle", { module: moduleName })}
        description={
          <>
            {t("lockDescription")}
            <span className="mt-2 flex items-center justify-center gap-2">
              <Badge variant="premium" size="sm">
                {moduleName}
              </Badge>
              <DemoBadge size="sm" />
            </span>
          </>
        }
        action={
          <div className="flex flex-col items-center gap-2">
            <Button asChild variant="primary">
              <Link href="/profile/plan">{t("lockCta")}</Link>
            </Button>
            <span className="type-caption text-fg-muted">{t("lockNote")}</span>
          </div>
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
