import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { SellerProductsView } from "@/components/commerce/seller/views/SellerProductsView";
import { Button } from "@/components/ui";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { getAdminSellerOrg } from "../_lib/org";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  const [org, t] = await Promise.all([getAdminSellerOrg(id), getTranslations("adminOps.sellers.hub")]);
  return { title: org ? `${org.name} · ${t("tabs.products")}` : t("tabs.products") };
}

// Aba Produtos: catálogo da organização (qualquer tipo, própria ou parceira) com filtros e atalhos de
// disponibilidade/estoque; criar e editar com o mesmo formulário que o fornecedor usava.
export default async function SellerProductsTab({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const [t, th] = await Promise.all([getTranslations("seller.products"), getTranslations("adminOps.sellers.hub")]);
  const base = sellerHubHref(org.id, "products");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm max-w-prose text-fg-muted">{th("productsDescription", { name: org.name })}</p>
        <Button asChild size="sm" leadingIcon={<PackagePlus />}>
          <Link href={`${base}/new`}>{t("new")}</Link>
        </Button>
      </div>
      <SellerProductsView orgId={org.id} base={base} params={query} admin />
    </div>
  );
}
