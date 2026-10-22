import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { FilterBar, type FilterField } from "@/components/admin-content";
import { IngredientLinksPanel } from "@/components/admin-content/IngredientLinksPanel";
import { CreateLinkDialog, LinkActions } from "@/components/admin-content/LinkAdminActions";
import { LinkTabsNav } from "@/components/admin-content/LinkTabsNav";
import { escapeLike, hasAnyFilter, pickEnum, pickSearch, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Vínculos conteúdo–produto: lista, motivo de suspensão, versão validada vs. atual e ações.

const STATES = ["suggested", "validated", "suspended", "rejected"] as const;
const LIMIT = 100;

type Row = {
  id: string;
  status: Enums<"link_status">;
  note: string | null;
  suspended_reason: string | null;
  product_version_at_validation: number | null;
  validated_at: string | null;
  created_at: string;
  content: { id: string; title: string; slug: string } | null;
  product: { id: string; title: string; version: number; seller: { name: string } | null } | null;
  creator: { name: string } | null;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.links");
  return { title: t("title") };
}

// "product_significant_change:title,attributes" → campos legíveis
function suspensionLabel(reason: string | null, t: (key: "autoSuspend" | "adminSuspend", values?: Record<string, string>) => string): string | null {
  if (!reason) return null;
  if (reason.startsWith("product_significant_change:")) return t("autoSuspend", { fields: reason.split(":")[1] ?? "" });
  if (reason === "admin") return t("adminSuspend");
  return reason;
}

export default async function AdminLinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [t, tc, ts, tsh, locale] = await Promise.all([
    getTranslations("adminContent.links"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon"),
    getTranslations("shopping.admin"),
    getLocale(),
  ]);
  // Abas (fase 5): Conteúdos (content_product_links) e Ingredientes (recipe_ingredient_products)
  const tab = pickEnum(params, "aba", ["ingredientes"] as const) ?? "conteudos";
  const tabs = [
    { value: "conteudos", label: tsh("tabs.content"), href: "/admin/links" },
    { value: "ingredientes", label: tsh("tabs.ingredients"), href: "/admin/links?aba=ingredientes" },
  ];
  if (tab === "ingredientes") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <LinkTabsNav tabs={tabs} value={tab} label={tsh("tabsLabel")} />
        <IngredientLinksPanel params={params} />
      </div>
    );
  }
  const supabase = await createClient();
  const status = pickEnum(params, "status", STATES);
  const contentQ = pickSearch(params, "content");
  const productQ = pickSearch(params, "product");
  const creator = pickUuid(params, "creator");

  let query = supabase
    .from("content_product_links")
    .select(
      "id, status, note, suspended_reason, product_version_at_validation, validated_at, created_at, content:content!inner(id, title, slug), product:products!inner(id, title, version, seller:seller_organizations(name)), creator:creator_profiles(name)",
    )
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (status) query = query.eq("status", status);
  if (contentQ) query = query.ilike("content.title", `%${escapeLike(contentQ)}%`);
  if (productQ) query = query.ilike("product.title", `%${escapeLike(productQ)}%`);
  if (creator) query = query.eq("suggested_by_creator", creator);

  const [listRes, creatorsRes] = await Promise.all([query, supabase.from("creator_profiles").select("id, name").order("name")]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as Row[];

  const fields: FilterField[] = [
    { name: "status", label: tc("status"), type: "select", value: status ?? "", options: STATES.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "content", label: t("filters.contentTitle"), type: "text", value: contentQ },
    { name: "product", label: t("filters.productTitle"), type: "text", value: productQ },
    { name: "creator", label: t("filters.creator"), type: "select", value: creator ?? "", options: (creatorsRes.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
  ];

  const columns: Column<Row>[] = [
    {
      key: "content",
      header: t("table.content"),
      cell: (row) =>
        row.content ? (
          <Link href={`/admin/content/${row.content.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.content.title}
          </Link>
        ) : (
          tc("none")
        ),
    },
    {
      key: "product",
      header: t("table.product"),
      cell: (row) =>
        row.product ? (
          <div className="flex min-w-0 flex-col">
            <Link href={`/admin/products/${row.product.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {row.product.title}
            </Link>
            <span className="text-xs text-fg-muted">{row.product.seller?.name ?? ""}</span>
          </div>
        ) : (
          tc("none")
        ),
    },
    {
      key: "status",
      header: t("table.status"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} label={ts(`status.${row.status}`)} />
          {row.status === "suspended" && row.suspended_reason && <span className="type-caption text-fg-muted">{suspensionLabel(row.suspended_reason, t)}</span>}
        </div>
      ),
    },
    {
      key: "versions",
      header: t("table.versions"),
      hideOnMobile: true,
      cell: (row) => {
        const validated = row.product_version_at_validation;
        const current = row.product?.version ?? null;
        if (validated === null) return <span className="text-fg-muted">{t("notValidated")}</span>;
        const mismatch = current !== null && validated !== current;
        return (
          <div className="flex flex-col gap-1">
            <span className="type-numeric">
              v{validated} / v{current ?? "?"}
            </span>
            <Badge size="sm" variant={mismatch ? "warning" : "success"}>
              {mismatch ? t("versionMismatch") : t("versionOk")}
            </Badge>
          </div>
        );
      },
    },
    { key: "suggested", header: t("table.suggestedBy"), hideOnMobile: true, cell: (row) => row.creator?.name ?? t("admin") },
    { key: "note", header: t("table.note"), hideOnMobile: true, cell: (row) => <span className="text-fg-muted">{row.note ?? tc("none")}</span> },
    { key: "date", header: ts("table.createdAt"), hideOnMobile: true, cell: (row) => <span className="type-numeric text-fg-muted">{formatDate(row.created_at, locale as Locale)}</span> },
    { key: "actions", header: ts("table.actions"), align: "right", cell: (row) => <LinkActions linkId={row.id} status={row.status} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<CreateLinkDialog />} />
      <LinkTabsNav tabs={tabs} value={tab} label={tsh("tabsLabel")} />
      <FilterBar action="/admin/links" fields={fields} active={hasAnyFilter(params, ["status", "content", "product", "creator"])} />
      <p className="type-caption text-fg-muted" aria-live="polite">
        {tc("results", { n: rows.length })}
        {rows.length >= LIMIT ? ` · ${tc("resultsCapped", { n: LIMIT })}` : ""}
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("table.caption")} emptyTitle={ts("table.noResults")} emptyDescription={ts("table.noResultsDescription")} />
    </div>
  );
}
