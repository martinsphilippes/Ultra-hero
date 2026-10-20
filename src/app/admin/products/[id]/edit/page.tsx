import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/admin-content";
import { AdminProductEditor } from "@/components/admin-content/ProductAdminActions";
import type { ProductFormValues } from "@/components/editors/types";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Edição de produto da operação própria (ProductForm). Parceiros: somente leitura no admin.

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.products.form");
  return { title: t("editTitle") };
}

export default async function AdminProductEditPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tc, productRes, orgsRes, categoriesRes] = await Promise.all([
    getTranslations("adminContent.products"),
    getTranslations("adminContent.common"),
    supabase
      .from("products")
      .select("id, seller_org_id, category_id, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, demo_stock, moderation_status, moderation_reason, seller:seller_organizations(kind)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("seller_organizations").select("id, name").eq("kind", "own").order("name"),
    supabase.from("product_categories").select("id, code, name, is_food").order("sort_order"),
  ]);
  const product = productRes.data as unknown as (ProductFormValues & { moderation_status: "clear" | "hidden" | "suspended"; moderation_reason: string | null; seller: { kind: string } | null }) | null;
  if (!product) notFound();

  if (product.seller?.kind !== "own") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("form.editTitle")} backHref={`/admin/products/${id}`} backLabel={tc("view")} />
        <p role="note" className="rounded-lg border border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-fg">
          {t("detail.partnerReadOnly")}
        </p>
      </div>
    );
  }

  const initial: Partial<ProductFormValues> = {
    id: product.id,
    seller_org_id: product.seller_org_id,
    category_id: product.category_id,
    title: product.title,
    description: product.description,
    image_url: product.image_url,
    price_cents_demo: product.price_cents_demo,
    product_type: product.product_type,
    attributes: (product.attributes as Record<string, unknown>) ?? {},
    food_info: product.food_info,
    status: product.status,
    availability: product.availability,
    demo_stock: product.demo_stock,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={product.title} title={t("form.editTitle")} description={t("form.createDescription")} backHref={`/admin/products/${id}`} backLabel={tc("view")} />
      <DemoNotice />
      <AdminProductEditor
        productId={id}
        mode="edit"
        initial={initial}
        sellerOrgs={orgsRes.data ?? []}
        categories={(categoriesRes.data ?? []).map((c) => ({ id: c.id, code: c.code, name: (c.name as Record<string, string>) ?? {}, is_food: c.is_food }))}
        moderation={{ status: product.moderation_status, reason: product.moderation_reason }}
      />
    </div>
  );
}
