import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { SellerProductsView } from "@/components/commerce/seller/views/SellerProductsView";
import { Button, PageHeader } from "@/components/ui";
import { getSellerContext } from "../_lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.products");
  return { title: t("title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Lista de produtos da organização ativa com filtros (URL) e atalhos de disponibilidade/estoque.
export default async function SellerProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const [ctx, params, t, tn] = await Promise.all([getSellerContext(), searchParams, getTranslations("seller.products"), getTranslations("nav.seller")]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description", { name: ctx.org.name })}
        backHref="/seller"
        backLabel={tn("dashboard")}
        actions={
          <Button asChild size="sm" leadingIcon={<PackagePlus />}>
            <Link href="/seller/products/new">{t("new")}</Link>
          </Button>
        }
      />
      <SellerHeader ctx={ctx} />
      <SellerProductsView orgId={ctx.org.id} base="/seller/products" params={params} />
    </div>
  );
}
