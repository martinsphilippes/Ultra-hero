import { Heart, ListChecks, LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EntryCard } from "@/components/catalog";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatRelativeTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { getUser } from "@/lib/auth/session";
import { FAVORITE_SELECT, FAVORITE_SELECT_LEGACY, isMissingMixedFavoritesError, toFavoriteEntries, type FavoriteRow } from "@/lib/library/favorites";
import { isMissingMixedListsError, LIST_COUNT_ITEMS, LIST_COUNT_ITEMS_LEGACY, visibleItemCount } from "@/lib/library/list-items";
import { createClient } from "@/lib/supabase/server";
import { SCROLL_CARD } from "../grid";
import { InlineError } from "../InlineError";
import { CreateListButton } from "./CreateListButton";
import { ListActions } from "./ListActions";

type ListRow = { id: string; name: string; updated_at: string; items: { content?: unknown; product?: unknown; program?: unknown }[] | null };

const FAVORITES_PREVIEW = 8;

// Aba "Listas": favoritos como pseudo-lista automática (só leitura) + listas pessoais com CRUD.
export async function ListsTab() {
  const [user, t] = await Promise.all([getUser(), getTranslations("discover.explore.lists")]);

  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
          icon={<LogIn />}
          title={t("visitorTitle")}
          description={t("visitorDescription")}
          action={
            <Button asChild>
              <Link href={`/login?next=${encodeURIComponent("/explore?tab=listas")}`}>{t("visitorCta")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [supabase, locale] = await Promise.all([createClient(), getLocale()]);
  const listsQuery = (items: string) =>
    supabase.from("custom_lists").select(`id, name, updated_at, ${items}`).eq("user_id", user.id).order("updated_at", { ascending: false });
  const favoritesQuery = (select: string) =>
    supabase.from("favorites").select(select).eq("user_id", user.id).order("created_at", { ascending: false }).limit(FAVORITES_PREVIEW + 1);
  const [mixedFavRes, mixedRes] = await Promise.all([favoritesQuery(FAVORITE_SELECT), listsQuery(LIST_COUNT_ITEMS)]);
  // Sem a 0041 no banco, os favoritos são só conteúdos (leitura antiga).
  const favRes = mixedFavRes.error && isMissingMixedFavoritesError(mixedFavRes.error) ? await favoritesQuery(FAVORITE_SELECT_LEGACY) : mixedFavRes;
  // Sem a 0040 no banco, conta só os conteúdos (a lista só pode ter conteúdos).
  const listsRes = mixedRes.error && isMissingMixedListsError(mixedRes.error) ? await listsQuery(LIST_COUNT_ITEMS_LEGACY) : mixedRes;

  // Conteúdos, produtos e programas, cada um com o seu card; alvo escondido pela RLS some.
  const favorites = toFavoriteEntries((favRes.data ?? []) as unknown as FavoriteRow[]);
  const favoritesPreview = favorites.slice(0, FAVORITES_PREVIEW);
  const lists = (listsRes.data ?? []) as unknown as ListRow[];

  return (
    <div className="flex flex-col gap-8">
      {/* Favoritos: lista automática, só leitura (gerida em Evolução/Perfil) */}
      <section aria-labelledby="favorites-title" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="favorites-title" className="type-h3 inline-flex items-center gap-2 text-fg">
              <Heart className="size-5 text-accent" aria-hidden="true" />
              {t("favorites")}
              <Badge variant="neutral" size="sm">
                {t("favoritesAuto")}
              </Badge>
            </h2>
            <p className="type-caption text-fg-muted">
              {favorites.length > FAVORITES_PREVIEW ? t("favoritesMore", { count: FAVORITES_PREVIEW }) : t("favoritesCount", { count: favorites.length })}
            </p>
          </div>
        </div>
        {favRes.error ? (
          <InlineError />
        ) : favoritesPreview.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
            <EmptyState size="sm" icon={<Heart />} title={t("favoritesEmpty")} />
          </div>
        ) : (
          <div className="-mx-gutter flex gap-3 overflow-x-auto px-gutter pb-1 scrollbar-none snap-x snap-mandatory">
            {favoritesPreview.map((item) => (
              <div key={item.key} className={`${SCROLL_CARD} shrink-0 snap-start`} data-testid="favorite-entry" data-kind={item.kind}>
                <EntryCard item={item} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Listas pessoais */}
      <section aria-labelledby="lists-title" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="lists-title" className="type-h3 text-fg">
              {t("mine")}
            </h2>
            <p className="type-caption text-fg-muted">{t("description")}</p>
          </div>
          <CreateListButton />
        </div>

        {listsRes.error ? (
          <InlineError />
        ) : lists.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<ListChecks />} title={t("emptyTitle")} description={t("emptyDescription")} action={<CreateListButton />} />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <li key={list.id}>
                <Card stepped className="h-full">
                  <div className="flex items-start justify-between gap-2 p-4 pb-2">
                    <Link
                      href={`/explore/lists/${list.id}`}
                      className="min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      aria-label={t("openNamed", { name: list.name })}
                    >
                      <h3 className="type-h3 line-clamp-2 text-fg hover:underline">{list.name}</h3>
                    </Link>
                    <ListActions listId={list.id} name={list.name} />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                    <p className="type-caption text-fg-muted">
                      {t("items", { count: visibleItemCount(list.items) })} · {t("updated", { when: formatRelativeTime(list.updated_at, locale) })}
                    </p>
                    <Button asChild variant="link" size="sm">
                      <Link href={`/explore/lists/${list.id}`} tabIndex={-1} aria-hidden="true">
                        {t("open")}
                      </Link>
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
