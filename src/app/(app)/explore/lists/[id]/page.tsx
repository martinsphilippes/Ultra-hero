import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EntryCard } from "@/components/catalog";
import { ListActions } from "@/components/discover/explore/ListActions";
import { RemoveFromListButton } from "@/components/discover/explore/RemoveFromListButton";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatRelativeTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { isMissingMixedListsError, LIST_ITEM_SELECT, LIST_ITEM_SELECT_LEGACY, toListEntries, type ListItemRow } from "@/lib/library/list-items";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
const LISTS_HREF = "/explore?tab=listas";

// A RLS garante que só o dono enxerga a lista; qualquer outra coisa é 404.
async function loadList(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("custom_lists").select("id, name, updated_at").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const [list, t] = await Promise.all([loadList(id), getTranslations("discover.meta")]);
  return { title: list ? t("list", { name: list.name }) : t("lists") };
}

// Página de uma lista pessoal: cards com ação de remover; renomear/excluir no cabeçalho.
export default async function ListPage({ params }: Params) {
  const { id } = await params;
  await requireUser(`/explore/lists/${id}`);
  const [list, t, locale] = await Promise.all([loadList(id), getTranslations("discover.explore.lists"), getLocale()]);
  if (!list) notFound();

  const supabase = await createClient();
  const query = (select: string) => supabase.from("list_items").select(select).eq("list_id", list.id);
  // Conteúdo, produto e programa misturados (0040); sem a migração no banco, só os conteúdos.
  let res = await query(LIST_ITEM_SELECT);
  if (res.error && isMissingMixedListsError(res.error)) res = await query(LIST_ITEM_SELECT_LEGACY);
  const { error } = res;
  // Ordem por posição (empate: o mais recente primeiro); alvo despublicado some pela RLS.
  const items = toListEntries((res.data ?? []) as unknown as ListItemRow[]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={list.name}
        description={`${t("items", { count: items.length })} · ${t("updated", { when: formatRelativeTime(list.updated_at, locale) })}`}
        backHref={LISTS_HREF}
        backLabel={t("backToLists")}
        actions={<ListActions listId={list.id} name={list.name} size="md" afterDeleteHref={LISTS_HREF} />}
      />

      {error ? (
        <InlineError />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<ListChecks />}
            title={t("listEmptyTitle")}
            description={`${t("mixHint")} ${t("listEmptyDescription")}`}
            action={
              <Button asChild variant="secondary">
                <Link href="/explore">{t("browseContent")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className={CARD_GRID}>
          {items.map((item, index) => (
            <li key={item.key} className="flex flex-col gap-1" data-testid="list-item" data-kind={item.kind}>
              <EntryCard item={item} priority={index === 0} />
              <RemoveFromListButton listId={list.id} kind={item.kind} id={item.id} title={item.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
