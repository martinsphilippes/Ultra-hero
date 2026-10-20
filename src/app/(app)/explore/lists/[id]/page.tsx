import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ContentCard } from "@/components/catalog";
import { ListActions } from "@/components/discover/explore/ListActions";
import { RemoveFromListButton } from "@/components/discover/explore/RemoveFromListButton";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatRelativeTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
type ItemRow = { added_at: string; content: ContentCardData | null };

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
  const { data, error } = await supabase
    .from("list_items")
    .select(`added_at, content:content(${CONTENT_CARD_SELECT})`)
    .eq("list_id", list.id)
    .order("added_at", { ascending: false });
  // Conteúdo despublicado some pela RLS: não aparece na lista.
  const items = ((data ?? []) as unknown as ItemRow[]).filter((row): row is ItemRow & { content: ContentCardData } => Boolean(row.content));

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
            description={t("listEmptyDescription")}
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
            <li key={item.content.id} className="flex flex-col gap-1">
              <ContentCard content={item.content} priority={index === 0} />
              <RemoveFromListButton listId={list.id} contentId={item.content.id} title={item.content.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
