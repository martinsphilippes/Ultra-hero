import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DataTable, type Column } from "@/components/admin";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { RestoreVersionButton } from "@/components/recipes/portal/RestoreVersionButton";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../../../_lib/creator";
import { loadOwnRecipeContent } from "../../_lib/load";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("recipes.versions");
  return { title: t("metaTitle") };
}

type VersionRow = { id: string; version_no: number; reason: string; changed_sections: string[]; created_by: string | null; created_at: string };

// Histórico de versões da receita: data, motivo, autor e seções alteradas de cada versão imutável,
// com "Restaurar no rascunho" (sem comparação lado a lado, decisão do desenho).
export default async function RecipeVersionsPage({ params }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, tp, tn, locale, ctx] = await Promise.all([getTranslations("recipes.versions"), getTranslations("recipes.portal"), getTranslations("nav"), getLocale(), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("title")} />;
  const creatorId = ctx.creatorId;
  const supabase = await createClient();
  const content = await loadOwnRecipeContent(supabase, id, creatorId);
  if (!content) notFound();

  const { data, error } = await supabase
    .from("recipe_versions")
    .select("id, version_no, reason, changed_sections, created_by, created_at")
    .eq("content_id", id)
    .order("version_no", { ascending: false })
    .limit(100);
  // banco sem a 0027: lista vazia em vez de erro
  const rows = (error ? [] : (data ?? [])) as VersionRow[];
  const editable = content.status === "draft" && content.review_status !== "in_review";
  const uiLocale = locale as Locale;

  const columns: Column<VersionRow>[] = [
    { key: "version", header: t("columns.version"), cell: (v) => <span className="font-semibold text-fg">{t("number", { n: v.version_no })}</span> },
    { key: "date", header: t("columns.date"), cell: (v) => <span className="text-fg-muted">{formatDateTime(v.created_at, uiLocale)}</span> },
    { key: "reason", header: t("columns.reason"), cell: (v) => <Badge size="sm">{t.has(`reasons.${v.reason}`) ? t(`reasons.${v.reason}`) : v.reason}</Badge> },
    {
      key: "author",
      header: t("columns.author"),
      hideOnMobile: true,
      cell: (v) => <span className="text-fg-muted">{v.created_by === null ? t("authorUnknown") : v.created_by === ctx.userId ? t("authorYou") : t("authorOther")}</span>,
    },
    {
      key: "changes",
      header: t("columns.changes"),
      cell: (v) =>
        v.changed_sections.length === 0 ? (
          <span className="type-caption text-fg-muted">{t("noChanges")}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {v.changed_sections.map((s) => (
              <Badge key={s} size="sm" variant="neutral">
                {t.has(`sections.${s}`) ? t(`sections.${s}`) : s}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      key: "actions",
      header: t("columns.actions"),
      align: "right",
      cell: (v) =>
        v.reason === "restore_point" ? (
          <span className="type-caption text-fg-muted">{t("notRestorable")}</span>
        ) : editable ? (
          <RestoreVersionButton versionId={v.id} contentId={id} creatorId={creatorId} versionNo={v.version_no} />
        ) : (
          <span className="type-caption text-fg-muted">{t("notEditable")}</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${t("title")} · ${content.title}`} description={t("description")} eyebrow={tn("portals.creator")} backHref={`/creator/recipes/${id}/edit`} backLabel={tp("actions.edit")} />
      <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} caption={t("caption")} emptyTitle={t("empty")} />
    </div>
  );
}
