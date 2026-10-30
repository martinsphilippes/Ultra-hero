import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateOrgProductAction } from "@/app/admin/sellers/product-actions";
import { StatusBadge } from "@/components/admin";
import { ProductModerationActions } from "@/components/admin-content/ProductAdminActions";
import { loadOrgProduct, SellerProductEditor } from "@/components/commerce/seller/views/SellerProductEditor";
import { Badge, Button } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { getAdminSellerOrg } from "../../../_lib/org";

type Props = { params: Promise<{ id: string; productId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.products");
  return { title: t("editTitle") };
}

// Edição do produto da organização: o mesmo editor do fornecedor (formulário + versões) e, ao lado,
// a moderação do admin (ocultar/suspender/liberar, auditada) e o atalho para a ficha do produto.
export default async function SellerEditProductTab({ params, searchParams }: Props) {
  const [{ id, productId }, query] = await Promise.all([params, searchParams]);
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const loaded = await loadOrgProduct(org.id, productId);
  if (!loaded) notFound();
  const { product } = loaded;
  const [t, ts, th] = await Promise.all([getTranslations("seller.products"), getTranslations("adminCommon.status"), getTranslations("adminOps.sellers.hub")]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={sellerHubHref(org.id, "products")}>{t("backToList")}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="type-h2 text-balance text-fg">{product.title}</h2>
          <p className="type-body-sm max-w-prose text-fg-muted">{t("editDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} label={ts(product.status)} />
          <Badge variant="neutral">{t("versions.current", { n: product.version })}</Badge>
        </div>
      </div>
      <SellerProductEditor
        {...loaded}
        org={{ id: org.id, name: org.name }}
        created={query.created === "1"}
        action={updateOrgProductAction.bind(null, org.id)}
        asideTop={
          <section aria-labelledby="product-moderation-admin" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="hub-product-moderation">
            <h2 id="product-moderation-admin" className="type-h3 flex flex-wrap items-center gap-2 text-fg">
              {th("moderationTitle")}
              <StatusBadge status={product.moderation_status} label={ts(product.moderation_status)} />
            </h2>
            <ProductModerationActions productId={product.id} moderation={product.moderation_status} />
            <Button asChild variant="link" className="w-fit px-0">
              <Link href={`/admin/products/${product.id}`}>{th("productSheet")}</Link>
            </Button>
          </section>
        }
      />
    </div>
  );
}
