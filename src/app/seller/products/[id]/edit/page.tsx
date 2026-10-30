import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { loadOrgProduct, SellerProductEditor } from "@/components/commerce/seller/views/SellerProductEditor";
import { Badge, PageHeader } from "@/components/ui";
import { getSellerContext } from "../../../_lib/context";
import { updateSellerProduct } from "../../actions";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.products");
  return { title: t("editTitle") };
}

// Edição de produto: formulário compartilhado, bloco de moderação (somente leitura) e histórico de versões.
export default async function SellerEditProductPage({ params, searchParams }: Params) {
  const [{ id }, query, ctx, t, ts] = await Promise.all([params, searchParams, getSellerContext(), getTranslations("seller.products"), getTranslations("adminCommon.status")]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;
  const loaded = await loadOrgProduct(ctx.org.id, id);
  if (!loaded) notFound();
  const { product } = loaded;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("editTitle")}
        description={t("editDescription")}
        backHref="/seller/products"
        backLabel={t("backToList")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.status} label={ts(product.status)} />
            <Badge variant="neutral">{t("versions.current", { n: product.version })}</Badge>
          </div>
        }
      />
      <SellerHeader ctx={ctx} />
      <SellerProductEditor {...loaded} org={{ id: ctx.org.id, name: ctx.org.name }} created={query.created === "1"} action={updateSellerProduct} />
    </div>
  );
}
