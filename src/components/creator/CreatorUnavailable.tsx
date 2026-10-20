import { ShieldAlert, UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import type { CreatorUnavailableReason } from "@/app/creator/_lib/creator";

type Props = { reason: CreatorUnavailableReason; name?: string | null; title?: string };

// Estado explicativo quando my_creator_id() é nulo: perfil suspenso/inativo ou conta sem vínculo.
export async function CreatorUnavailable({ reason, name, title }: Props) {
  const [t, tn, tc] = await Promise.all([getTranslations("creator.unavailable"), getTranslations("nav"), getTranslations("common.actions")]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title ?? tn("creator.dashboard")} eyebrow={tn("portals.creator")} />
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
        <EmptyState
          icon={reason === "inactive" ? <ShieldAlert /> : <UserX />}
          title={t(`${reason}.title`)}
          description={reason === "inactive" && name ? t("inactive.descriptionNamed", { name }) : t(`${reason}.description`)}
          action={
            <Button asChild variant="secondary">
              <Link href="/">{tc("goHome")}</Link>
            </Button>
          }
        />
      </div>
      <p className="type-caption text-fg-muted">{t("help")}</p>
    </div>
  );
}
