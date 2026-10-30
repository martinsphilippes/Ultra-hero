import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SellerFulfillmentsView } from "@/components/commerce/seller/views/SellerFulfillmentsView";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { getAdminSellerOrg } from "../_lib/org";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  const [org, t] = await Promise.all([getAdminSellerOrg(id), getTranslations("adminOps.sellers.hub")]);
  return { title: org ? `${org.name} · ${t("tabs.shipments")}` : t("tabs.shipments") };
}

// Aba Remessas: remessas de pedidos de teste desta organização, com filtro de status.
export default async function SellerShipmentsTab({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const th = await getTranslations("adminOps.sellers.hub");
  await advanceTransportSimulation();

  return (
    <div className="flex flex-col gap-6">
      <p className="type-body-sm max-w-prose text-fg-muted">{th("shipmentsDescription", { name: org.name })}</p>
      <DemoNotice>{th("shipmentsNote")}</DemoNotice>
      <SellerFulfillmentsView orgId={org.id} base={sellerHubHref(org.id, "shipments")} params={query} />
    </div>
  );
}
