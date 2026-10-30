import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createOrgProductAction } from "@/app/admin/sellers/product-actions";
import { loadProductCategories } from "@/components/commerce/seller/views/SellerProductEditor";
import { ProductForm } from "@/components/editors/ProductForm";
import { BackLink } from "@/components/ui/back-link";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { getAdminSellerOrg } from "../../_lib/org";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.products");
  return { title: t("newTitle") };
}

// Novo produto da organização (formulário compartilhado; a ação do admin grava nesta organização).
export default async function SellerNewProductTab({ params }: Params) {
  const { id } = await params;
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const [t, categories] = await Promise.all([getTranslations("seller.products"), loadProductCategories()]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={sellerHubHref(org.id, "products")}>{t("backToList")}</BackLink>
      <div className="flex flex-col gap-1">
        <h2 className="type-h2 text-fg">{t("newTitle")}</h2>
        <p className="type-body-sm text-fg-muted">{t("newDescription")}</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 md:p-6">
        <ProductForm
          mode="create"
          initial={{ seller_org_id: org.id }}
          sellerOrgs={[{ id: org.id, name: org.name }]}
          categories={categories}
          action={createOrgProductAction.bind(null, org.id)}
        />
      </div>
    </div>
  );
}
