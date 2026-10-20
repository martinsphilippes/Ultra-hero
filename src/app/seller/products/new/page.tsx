import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { ProductForm } from "@/components/editors/ProductForm";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getSellerContext } from "../../_lib/context";
import { createSellerProduct } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.products");
  return { title: t("newTitle") };
}

// Novo produto da organização ativa (formulário compartilhado + server action do fornecedor).
export default async function SellerNewProductPage() {
  const [ctx, t] = await Promise.all([getSellerContext(), getTranslations("seller.products")]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;
  const supabase = await createClient();
  const { data: categories } = await supabase.from("product_categories").select("id, code, name, is_food, sort_order").order("sort_order");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/seller/products" backLabel={t("backToList")} />
      <SellerHeader ctx={ctx} />
      <div className="rounded-2xl border border-border bg-surface p-5 md:p-6">
        <ProductForm
          mode="create"
          initial={{ seller_org_id: ctx.org.id }}
          sellerOrgs={[{ id: ctx.org.id, name: ctx.org.name }]}
          categories={(categories ?? []).map((c) => ({ id: c.id, code: c.code, name: c.name as Record<string, string>, is_food: c.is_food }))}
          action={createSellerProduct}
        />
      </div>
    </div>
  );
}
