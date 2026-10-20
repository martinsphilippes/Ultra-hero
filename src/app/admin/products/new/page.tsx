import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DemoNotice } from "@/components/admin-content";
import { AdminProductEditor } from "@/components/admin-content/ProductAdminActions";
import { EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Novo produto demonstrativo da operação própria.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.products.form");
  return { title: t("createTitle") };
}

export default async function AdminProductNewPage() {
  const supabase = await createClient();
  const [t, tc, orgsRes, categoriesRes] = await Promise.all([
    getTranslations("adminContent.products.form"),
    getTranslations("adminContent.common"),
    supabase.from("seller_organizations").select("id, name").eq("kind", "own").order("name"),
    supabase.from("product_categories").select("id, code, name, is_food").order("sort_order"),
  ]);
  const orgs = orgsRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} description={t("createDescription")} backHref="/admin/products" backLabel={tc("backToList")} />
      <DemoNotice />
      {orgs.length === 0 ? (
        <EmptyState title={t("noOwnOrg")} size="sm" />
      ) : (
        <AdminProductEditor
          productId={null}
          mode="create"
          initial={{ seller_org_id: orgs[0].id, status: "draft", availability: "available", product_type: "physical", attributes: {}, food_info: null, price_cents_demo: 0, demo_stock: null }}
          sellerOrgs={orgs}
          categories={(categoriesRes.data ?? []).map((c) => ({ id: c.id, code: c.code, name: (c.name as Record<string, string>) ?? {}, is_food: c.is_food }))}
        />
      )}
    </div>
  );
}
