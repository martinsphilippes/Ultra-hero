import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { SellerOverview } from "@/components/commerce/seller/views/SellerOverview";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { Button } from "@/components/ui";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { getAdminSellerOrg } from "./_lib/org";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const [org, t] = await Promise.all([getAdminSellerOrg(id), getTranslations("adminOps.sellers.hub")]);
  return { title: org ? `${org.name} · ${t("tabs.overview")}` : t("tabs.overview") };
}

// Aba Visão geral: o mesmo painel que o fornecedor tinha (produtos por status, remessas abertas,
// moderação recente e atalhos), agora operado pelo admin.
export default async function SellerOverviewPage({ params }: Params) {
  const { id } = await params;
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const t = await getTranslations("seller.dashboard");
  await advanceTransportSimulation();
  const shipments = sellerHubHref(org.id, "shipments");
  const products = sellerHubHref(org.id, "products");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild size="sm" leadingIcon={<PackagePlus />}>
          <Link href={`${products}/new`}>{t("newProduct")}</Link>
        </Button>
      </div>
      <SellerOverview
        orgId={org.id}
        links={{
          products,
          fulfillments: shipments,
          profile: sellerHubHref(org.id, "organization"),
          productEdit: (productId) => `${products}/${productId}/edit`,
          fulfillmentsByStatus: (status) => `${shipments}?status=${status}`,
        }}
      />
    </div>
  );
}
