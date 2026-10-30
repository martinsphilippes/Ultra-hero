import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { History } from "lucide-react";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { ProductForm } from "@/components/editors/ProductForm";
import type { ProductFormProps, ProductFormValues } from "@/components/editors/types";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";

export type OrgProduct = {
  id: string;
  seller_org_id: string;
  category_id: string;
  title: string;
  description: string;
  image_url: string;
  price_cents_demo: number;
  product_type: "physical" | "kit" | "digital";
  attributes: Record<string, unknown>;
  food_info: { ingredients?: string[]; allergens?: string[]; storage?: string } | null;
  status: "draft" | "published" | "archived";
  availability: "available" | "unavailable";
  moderation_status: "clear" | "hidden" | "suspended";
  moderation_reason: string | null;
  demo_stock: number | null;
  version: number;
};

type VersionRow = { id: string; version: number; changed_fields: string[]; significant: boolean; created_at: string };
export type ProductCategoryOption = ProductFormProps["categories"][number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Categorias no formato do formulário compartilhado. */
export async function loadProductCategories(): Promise<ProductCategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("product_categories").select("id, code, name, is_food, sort_order").order("sort_order");
  return (data ?? []).map((c) => ({ id: c.id, code: c.code, name: c.name as Record<string, string>, is_food: c.is_food }));
}

// Produto da organização + categorias + últimas versões. null = não existe ou é de outra organização.
export async function loadOrgProduct(orgId: string, id: string): Promise<{ product: OrgProduct; versions: VersionRow[]; categories: ProductCategoryOption[] } | null> {
  if (!UUID_RE.test(id) || !UUID_RE.test(orgId)) return null;
  const supabase = await createClient();
  const [{ data: productRaw }, categories, { data: versionsRaw }] = await Promise.all([
    supabase
      .from("products")
      .select("id, seller_org_id, category_id, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, moderation_status, moderation_reason, demo_stock, version")
      .eq("id", id)
      .eq("seller_org_id", orgId)
      .maybeSingle(),
    loadProductCategories(),
    supabase.from("product_versions").select("id, version, changed_fields, significant, created_at").eq("product_id", id).order("version", { ascending: false }).limit(20),
  ]);
  const product = (productRaw as unknown as OrgProduct | null) ?? null;
  if (!product) return null;
  return { product, versions: (versionsRaw ?? []) as VersionRow[], categories };
}

export function productFormInitial(product: OrgProduct): ProductFormValues {
  return {
    id: product.id,
    seller_org_id: product.seller_org_id,
    category_id: product.category_id,
    title: product.title,
    description: product.description,
    image_url: product.image_url,
    price_cents_demo: product.price_cents_demo,
    product_type: product.product_type,
    attributes: product.attributes ?? {},
    food_info: product.food_info ? { ingredients: product.food_info.ingredients ?? [], allergens: product.food_info.allergens ?? [], storage: product.food_info.storage ?? "" } : null,
    status: product.status,
    availability: product.availability,
    demo_stock: product.demo_stock,
  };
}

type Props = {
  product: OrgProduct;
  versions: VersionRow[];
  categories: ProductCategoryOption[];
  org: { id: string; name: string };
  created: boolean;
  action: ProductFormProps["action"];
  /** Painel extra na coluna lateral, acima do histórico (ex.: moderação no admin). */
  asideTop?: ReactNode;
};

// Edição de produto: avisos, formulário compartilhado (ProductForm) e histórico de versões.
export async function SellerProductEditor({ product, versions, categories, org, created, action, asideTop }: Props) {
  const [t, ts, locale] = await Promise.all([getTranslations("seller.products"), getTranslations("adminCommon.status"), getLocale()]);
  const uiLocale = locale as Locale;
  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <DemoNotice tone="success" live="alert">
          {t("created")}
        </DemoNotice>
      ) : null}
      {product.status === "archived" ? <DemoNotice tone="info">{t("archivedNote")}</DemoNotice> : null}
      {product.moderation_status !== "clear" ? (
        <DemoNotice tone="warning" live="alert">
          {t("moderatedNote", { status: ts(product.moderation_status).toLowerCase() })}
        </DemoNotice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="rounded-2xl border border-border bg-surface p-5 md:p-6">
          <ProductForm
            mode="edit"
            initial={productFormInitial(product)}
            sellerOrgs={[{ id: org.id, name: org.name }]}
            categories={categories}
            moderation={{ status: product.moderation_status, reason: product.moderation_reason }}
            action={action}
          />
        </div>

        <div className="flex flex-col gap-4">
          {asideTop}
          <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" aria-labelledby="product-versions">
            <h2 id="product-versions" className="type-h3 flex items-center gap-2 text-fg">
              <History className="size-5 text-accent-text" aria-hidden="true" />
              {t("versions.title")}
            </h2>
            <p className="type-caption text-fg-muted">{t("versions.description")}</p>
            {versions.length === 0 ? (
              <p className="type-body-sm text-fg-muted">{t("versions.empty")}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {versions.map((v) => (
                  <li key={v.id} className="rounded-xl border border-border bg-surface-elevated p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{t("versions.version", { n: v.version })}</span>
                      {v.significant ? (
                        <Badge variant="warning" size="sm">
                          {t("versions.significant")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="type-caption text-fg-muted">
                      <time dateTime={v.created_at}>{formatDateTime(v.created_at, uiLocale)}</time>
                    </p>
                    <p className="type-caption mt-1 text-fg">
                      {t("versions.changed")}: {v.changed_fields.join(", ") || "—"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
