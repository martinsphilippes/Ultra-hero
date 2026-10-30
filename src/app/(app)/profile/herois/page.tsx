import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Users } from "lucide-react";
import { FollowedHeroesManager } from "@/components/heroes/FollowedHeroesManager";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getFollowContext } from "@/lib/heroes/follow-context";
import { loadCompareCreatorId, loadFollowedHeroes } from "@/lib/heroes/follow-queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("follows.manage");
  return { title: t("metaTitle") };
}

// Heróis que sigo: lista com "Seguindo" (toque para deixar de seguir) e a escolha do Hero de
// comparação (0056). Sem hero_favorites no banco, aviso; sem a 0056, só a lista.
export default async function FollowedHeroesPage() {
  const user = await requireUser("/profile/herois");
  const [t, tc, follow] = await Promise.all([getTranslations("follows.manage"), getTranslations("common"), getFollowContext()]);
  const supabase = await createClient();
  const [heroes, compareId] = await Promise.all([loadFollowedHeroes(supabase, user.id), loadCompareCreatorId(supabase, user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />
      {heroes === null ? (
        <p role="status" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg" data-testid="followed-unavailable">
          {t("unavailable")}
        </p>
      ) : heroes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
          <EmptyState
            icon={<Users />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button asChild variant="primary">
                <Link href="/personalities">{t("emptyCta")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="type-caption text-fg-muted" aria-live="polite">
            {heroes.length === 1 ? t("countOne") : t("countOther", { n: heroes.length })}
          </p>
          <FollowedHeroesManager
            heroes={heroes}
            // escolha antiga de herói que saiu do ar não aparece marcada
            compareId={compareId && heroes.some((h) => h.id === compareId) ? compareId : null}
            compareAvailable={compareId !== undefined}
            pushReady={follow.pushReady}
          />
        </>
      )}
    </div>
  );
}
