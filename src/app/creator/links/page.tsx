import type { Metadata } from "next";
import { Info } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { DeleteLinkButton } from "@/components/creator/DeleteLinkButton";
import { LinkSuggestForm } from "@/components/creator/LinkSuggestForm";
import { DemoBadge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.creator")} · ${t("creator.links")}` };
}

type LinkRow = {
  id: string;
  status: Enums<"link_status">;
  note: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
  content: { id: string; title: string } | null;
  product: { id: string; title: string; image_url: string } | null;
};

// Vínculos conteúdo ↔ produto: sugerir (RLS insert) e acompanhar o status decidido pelo admin.
export default async function CreatorLinksPage() {
  const [t, tn, ts, locale, ctx] = await Promise.all([getTranslations("creator"), getTranslations("nav"), getTranslations("adminCommon"), getLocale(), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={tn("creator.links")} />;

  const supabase = await createClient();
  const [{ data: contents }, { data: links, error }] = await Promise.all([
    supabase.from("content").select("id, title, status").eq("creator_id", ctx.creatorId).neq("status", "archived").order("title"),
    supabase
      .from("content_product_links")
      .select("id, status, note, suspended_reason, created_at, updated_at, content:content!inner(id, title, creator_id), product:products(id, title, image_url)")
      .eq("content.creator_id", ctx.creatorId)
      .order("created_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);
  const rows = (links ?? []) as unknown as LinkRow[];
  const uiLocale = locale as Locale;

  const columns: Column<LinkRow>[] = [
    {
      key: "product",
      header: t("links.columns.product"),
      cell: (row) =>
        row.product ? (
          <span className="flex items-center gap-2">
            <Image src={row.product.image_url} alt="" width={40} height={40} unoptimized={row.product.image_url.endsWith(".svg")} className="size-10 shrink-0 rounded-md border border-border object-cover" />
            <span className="line-clamp-2 font-medium text-fg">{row.product.title}</span>
          </span>
        ) : (
          <span className="text-fg-muted">{t("links.productUnavailable")}</span>
        ),
    },
    {
      key: "content",
      header: t("links.columns.content"),
      cell: (row) =>
        row.content ? (
          <Link href={`/creator/content/${row.content.id}/edit`} className="line-clamp-2 text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.content.title}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: "status",
      header: ts("table.status"),
      cell: (row) => (
        <span className="flex flex-col gap-1">
          <StatusBadge status={row.status} label={ts(`status.${row.status}`)} />
          {row.status === "suspended" && row.suspended_reason && <span className="type-caption text-fg-muted">{t("links.suspendedReason", { reason: row.suspended_reason.startsWith("product_significant_change") ? t("links.reasonProductChange") : row.suspended_reason })}</span>}
          {row.note && <span className="type-caption text-fg-muted">{t("links.noteLabel", { note: row.note })}</span>}
        </span>
      ),
    },
    { key: "created", header: ts("table.createdAt"), hideOnMobile: true, cell: (row) => <span className="text-fg-muted">{formatDateTime(row.created_at, uiLocale)}</span> },
    {
      key: "actions",
      header: ts("table.actions"),
      align: "right",
      cell: (row) => (row.status === "suggested" ? <DeleteLinkButton id={row.id} productTitle={row.product?.title ?? ""} /> : <span className="type-caption text-fg-subtle">{t("links.locked")}</span>),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tn("creator.links")} description={t("links.description")} eyebrow={tn("portals.creator")} actions={<DemoBadge size="md" />} />

      <aside role="note" aria-label={t("links.howTitle")} className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-fg">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("links.howTitle")}</p>
          <ul className="list-disc pl-4 type-body-sm text-fg-muted">
            <li>{t("links.how1")}</li>
            <li>{t("links.how2")}</li>
            <li>{t("links.how3")}</li>
          </ul>
        </div>
      </aside>

      <LinkSuggestForm contents={(contents ?? []).map((c) => ({ id: c.id, title: c.title, status: c.status }))} />

      <section aria-labelledby="my-links" className="flex flex-col gap-3">
        <h2 id="my-links" className="type-h2 text-fg">
          {t("links.mine")}
        </h2>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("links.tableCaption")} emptyTitle={t("links.emptyTitle")} emptyDescription={t("links.emptyDescription")} />
      </section>
    </div>
  );
}
