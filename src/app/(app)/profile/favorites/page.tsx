import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Heart } from "lucide-react";
import { EntryCard } from "@/components/catalog";
import { FavoriteItem } from "@/components/me/FavoriteItem";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { FAVORITE_SELECT, FAVORITE_SELECT_LEGACY, isMissingMixedFavoritesError, toFavoriteEntries, type FavoriteRow } from "@/lib/library/favorites";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("favorites") };
}

// Favoritos: grade com o card de cada tipo (conteúdo, produto, programa) e remoção.
export default async function FavoritesPage() {
  const user = await requireUser("/profile/favorites");
  const [t, tc] = await Promise.all([getTranslations("me.favorites"), getTranslations("common")]);
  const supabase = await createClient();
  const query = (select: string) => supabase.from("favorites").select(select).eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
  let res = await query(FAVORITE_SELECT);
  // Sem a 0041 no banco, só conteúdos (leitura antiga).
  if (res.error && isMissingMixedFavoritesError(res.error)) res = await query(FAVORITE_SELECT_LEGACY);
  if (res.error) throw new Error(res.error.message);
  // A contagem é do que aparece: alvo despublicado ou suspenso some pela RLS.
  const entries = toFavoriteEntries((res.data ?? []) as unknown as FavoriteRow[]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />
      <p className="type-caption text-fg-muted" aria-live="polite">
        {t("count", { n: entries.length })}
      </p>
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
          <EmptyState
            icon={<Heart />}
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <Button asChild variant="primary">
                <Link href="/explore">{t("empty.cta")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("title")}>
          {entries.map((item, index) => (
            <FavoriteItem key={item.key} kind={item.kind} id={item.id} title={item.title}>
              <EntryCard item={item} priority={index === 0} />
            </FavoriteItem>
          ))}
        </ul>
      )}
    </div>
  );
}
