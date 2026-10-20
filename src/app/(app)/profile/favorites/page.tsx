import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Heart } from "lucide-react";
import { ContentCard } from "@/components/catalog";
import { FavoriteItem } from "@/components/me/FavoriteItem";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("favorites") };
}

// Favoritos: grade de ContentCards com remoção.
type FavoriteRow = { content_id: string; created_at: string; content: ContentCardData | null };

export default async function FavoritesPage() {
  const user = await requireUser("/profile/favorites");
  const [t, tc] = await Promise.all([getTranslations("me.favorites"), getTranslations("common")]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select(`content_id, created_at, content:content(${CONTENT_CARD_SELECT})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as FavoriteRow[]).filter((row): row is FavoriteRow & { content: ContentCardData } => Boolean(row.content));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />
      <p className="type-caption text-fg-muted" aria-live="polite">
        {t("count", { n: rows.length })}
      </p>
      {rows.length === 0 ? (
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
          {rows.map((row, index) => (
            <FavoriteItem key={row.content_id} contentId={row.content_id} title={row.content.title}>
              <ContentCard content={row.content} priority={index === 0} />
            </FavoriteItem>
          ))}
        </ul>
      )}
    </div>
  );
}
