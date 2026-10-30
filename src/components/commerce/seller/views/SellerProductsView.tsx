import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { ProductQuickToggles } from "@/components/commerce/seller/ProductQuickToggles";
import { Button, Input, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDate } from "@/i18n/format";
import { localizedLabel } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  title: string;
  image_url: string;
  status: "draft" | "published" | "archived";
  availability: "available" | "unavailable";
  moderation_status: "clear" | "hidden" | "suspended";
  demo_stock: number | null;
  price_cents_demo: number;
  updated_at: string;
  category: { name: Record<string, string> } | null;
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Props = {
  orgId: string;
  /** Rota da lista (filtros GET, "/new" e "/{id}/edit" partem daqui). */
  base: string;
  params: Params;
  /** No admin: os atalhos usam as ações do admin para esta organização. */
  admin?: boolean;
};

// Produtos de uma organização com filtros (URL) e atalhos de disponibilidade/estoque.
// Usada no portal do fornecedor e na aba Produtos da organização no admin.
export async function SellerProductsView({ orgId, base, params, admin = false }: Props) {
  const [t, ts, locale] = await Promise.all([getTranslations("seller.products"), getTranslations("adminCommon.status"), getLocale()]);
  const q = first(params.q).trim().slice(0, 80);
  const status = first(params.status);
  const availability = first(params.availability);
  const moderation = first(params.moderation);

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, title, image_url, status, availability, moderation_status, demo_stock, price_cents_demo, updated_at, category:product_categories(name)")
    .eq("seller_org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (["draft", "published", "archived"].includes(status)) query = query.eq("status", status as Row["status"]);
  if (["available", "unavailable"].includes(availability)) query = query.eq("availability", availability as Row["availability"]);
  if (["clear", "hidden", "suspended"].includes(moderation)) query = query.eq("moderation_status", moderation as Row["moderation_status"]);
  if (q) query = query.ilike("title", `%${q.replace(/[,()%]/g, " ")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const uiLocale = locale as Locale;
  const fid = `products-${orgId.slice(0, 8)}`;

  const columns: Column<Row>[] = [
    {
      key: "product",
      header: t("columns.product"),
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated">
            <Image src={row.image_url} alt="" fill sizes="40px" unoptimized={row.image_url.endsWith(".svg")} className="object-cover" />
          </div>
          <div className="min-w-0">
            <Link
              href={`${base}/${row.id}/edit`}
              className="line-clamp-1 font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              aria-label={t("editLabel", { title: row.title })}
            >
              {row.title}
            </Link>
            {row.category ? <p className="type-caption text-fg-muted">{localizedLabel(row.category.name, uiLocale)}</p> : null}
          </div>
        </div>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (row) => <StatusBadge status={row.status} label={ts(row.status)} /> },
    { key: "moderation", header: t("columns.moderation"), cell: (row) => <StatusBadge status={row.moderation_status} label={ts(row.moderation_status)} />, hideOnMobile: true },
    { key: "price", header: t("columns.price"), cell: (row) => <span className="type-numeric">{formatCurrency(row.price_cents_demo / 100, uiLocale)}</span>, align: "right" },
    { key: "updated", header: t("columns.updated"), cell: (row) => formatDate(row.updated_at, uiLocale), hideOnMobile: true },
    {
      key: "actions",
      header: `${t("columns.availability")} · ${t("columns.stock")}`,
      cell: (row) => <ProductQuickToggles productId={row.id} title={row.title} availability={row.availability} demoStock={row.demo_stock} adminOrgId={admin ? orgId : undefined} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <form method="get" action={base} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end" aria-label={t("filtersLabel")}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fid}-q`} className="text-sm font-semibold text-fg">
            {t("search")}
          </label>
          <Input id={`${fid}-q`} name="q" type="search" defaultValue={q} leadingIcon={<Search />} inputSize="sm" autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fid}-status`} className="text-sm font-semibold text-fg">
            {t("filterStatus")}
          </label>
          <Select id={`${fid}-status`} name="status" defaultValue={status} selectSize="sm">
            <option value="">{t("all")}</option>
            {(["draft", "published", "archived"] as const).map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fid}-availability`} className="text-sm font-semibold text-fg">
            {t("filterAvailability")}
          </label>
          <Select id={`${fid}-availability`} name="availability" defaultValue={availability} selectSize="sm">
            <option value="">{t("all")}</option>
            <option value="available">{ts("available")}</option>
            <option value="unavailable">{ts("unavailable")}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fid}-moderation`} className="text-sm font-semibold text-fg">
            {t("filterModeration")}
          </label>
          <Select id={`${fid}-moderation`} name="moderation" defaultValue={moderation} selectSize="sm">
            <option value="">{t("all")}</option>
            {(["clear", "hidden", "suspended"] as const).map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" size="sm">
          {t("search")}
        </Button>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption={t("tableCaption")}
        emptyTitle={t("empty")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button asChild size="sm">
            <Link href={`${base}/new`}>{t("new")}</Link>
          </Button>
        }
      />
    </div>
  );
}
