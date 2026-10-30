import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin";
import { FulfillmentActions } from "@/components/commerce/seller/FulfillmentActions";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { loadOrgFulfillment, SellerFulfillmentDetail } from "@/components/commerce/seller/views/SellerFulfillmentDetail";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { shortShipmentId } from "@/lib/seller-ops/shipments";
import { getSellerContext } from "../../_lib/context";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("seller.fulfillments.detail");
  return { title: t("title", { id: shortShipmentId(id) }) };
}

// Detalhe da remessa: itens da própria organização (RLS), zona fictícia, linha do tempo e ações.
export default async function SellerFulfillmentPage({ params }: Params) {
  const [{ id }, ctx, t, ts, locale] = await Promise.all([params, getSellerContext(), getTranslations("seller.fulfillments"), getTranslations("adminCommon.status"), getLocale()]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;
  await advanceTransportSimulation();
  const fulfillment = await loadOrgFulfillment(ctx.org.id, id);
  if (!fulfillment) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("detail.title", { id: shortShipmentId(fulfillment.id) })}
        description={formatDateTime(fulfillment.created_at, locale as Locale)}
        backHref="/seller/fulfillments"
        backLabel={t("detail.backToList")}
        actions={<StatusBadge status={fulfillment.status} label={ts.has(fulfillment.status) ? ts(fulfillment.status) : fulfillment.status} size="md" />}
      />
      <SellerHeader ctx={ctx} />
      <SellerFulfillmentDetail
        fulfillment={fulfillment}
        actionsTitle={t("detail.actions")}
        actions={<FulfillmentActions fulfillmentId={fulfillment.id} status={fulfillment.status} />}
        zoneNote={t("detail.zoneNote")}
      />
    </div>
  );
}
