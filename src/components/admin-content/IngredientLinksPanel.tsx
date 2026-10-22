import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { Badge, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { FilterBar, type FilterField } from "./FilterBar";
import { IngredientLinkActions } from "./IngredientLinkActions";
import { pickEnum, type SearchParams } from "./lib/search-params";

// Aba "Ingredientes" de /admin/links (fase 5): fila das sugestões dos heróis para o produto de cada
// ingrediente (recipe_ingredient_products, 0027). Abre na fila (sugeridos); validar, suspender e
// recusar passam pela RPC auditada. Só o validado chega à lista de compras.

const STATES = ["suggested", "validated", "suspended", "rejected", "all"] as const;
const LIMIT = 100;

type Row = {
  id: string;
  status: Enums<"link_status">;
  note: string | null;
  suspended_reason: string | null;
  updated_at: string;
  ingredient: { name: string; content: { id: string; title: string; slug: string } | null } | null;
  product: { id: string; title: string; status: string; availability: string; moderation_status: string; demo_stock: number | null } | null;
};

export async function IngredientLinksPanel({ params }: { params: SearchParams }) {
  const [t, ts, locale] = await Promise.all([getTranslations("shopping.admin"), getTranslations("adminCommon"), getLocale()]);
  const status = pickEnum(params, "situacao", STATES) ?? "suggested";
  const supabase = await createClient();

  let query = supabase
    .from("recipe_ingredient_products")
    .select(
      "id, status, note, suspended_reason, updated_at, ingredient:recipe_ingredients!recipe_ingredient_products_ingredient_fk(name, content:content(id, title, slug)), product:products(id, title, status, availability, moderation_status, demo_stock)",
    )
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;

  const fields: FilterField[] = [
    {
      name: "situacao",
      label: t("filters.status"),
      type: "select",
      value: status,
      options: STATES.map((s) => ({ value: s, label: s === "all" ? t("filters.all") : ts(`status.${s}`) })),
    },
  ];
  const filters = <FilterBar action="/admin/links" fields={fields} active={status !== "suggested"} hidden={{ aba: "ingredientes" }} />;

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
        <div className="rounded-2xl border border-dashed border-border-strong" data-testid="ingredient-links-unavailable">
          <EmptyState size="sm" title={t("unavailable")} />
        </div>
      </div>
    );
  }
  const rows = (data ?? []) as unknown as Row[];

  const productNote = (p: Row["product"]) => {
    if (!p) return t("productHidden");
    const sellable = p.status === "published" && p.moderation_status === "clear" && p.availability === "available" && (p.demo_stock === null || p.demo_stock > 0);
    return sellable ? null : t("productUnavailable");
  };

  const columns: Column<Row>[] = [
    {
      key: "recipe",
      header: t("table.recipe"),
      cell: (row) =>
        row.ingredient?.content ? (
          <Link href={`/admin/content/${row.ingredient.content.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.ingredient.content.title}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "ingredient", header: t("table.ingredient"), cell: (row) => <span className="text-fg">{row.ingredient?.name ?? "—"}</span> },
    {
      key: "product",
      header: t("table.product"),
      cell: (row) => {
        const note = productNote(row.product);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            {row.product ? (
              <Link href={`/admin/products/${row.product.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {row.product.title}
              </Link>
            ) : null}
            {note ? (
              <Badge size="sm" variant="warning">
                {note}
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: t("table.status"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} label={ts(`status.${row.status}`)} />
          {row.status === "suspended" && row.suspended_reason ? <span className="type-caption text-fg-muted">{row.suspended_reason}</span> : null}
        </div>
      ),
    },
    { key: "note", header: t("table.note"), hideOnMobile: true, cell: (row) => <span className="text-fg-muted">{row.note ?? "—"}</span> },
    { key: "date", header: t("table.date"), hideOnMobile: true, cell: (row) => <span className="type-numeric text-fg-muted">{formatDate(row.updated_at, locale as Locale)}</span> },
    {
      key: "actions",
      header: t("table.actions"),
      align: "right",
      cell: (row) => <IngredientLinkActions linkId={row.id} status={row.status} label={`${row.ingredient?.name ?? ""} · ${row.product?.title ?? ""}`} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="ingredient-links">
      <p className="type-body-sm text-fg-muted">{t("description")}</p>
      {filters}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("table.caption")} emptyTitle={ts("table.noResults")} emptyDescription={t("empty")} />
    </div>
  );
}
