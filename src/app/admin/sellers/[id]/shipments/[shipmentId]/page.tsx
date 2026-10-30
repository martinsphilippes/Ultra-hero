import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin";
import { FulfillmentActions } from "@/components/admin-content/OrderAdminActions";
import { loadOrgFulfillment, SellerFulfillmentDetail } from "@/components/commerce/seller/views/SellerFulfillmentDetail";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { Button } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { adminTargetsFor, isFulfillmentStatus, shortShipmentId } from "@/lib/seller-ops/shipments";
import { getAdminSellerOrg } from "../../_lib/org";

type Props = { params: Promise<{ id: string; shipmentId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shipmentId } = await params;
  const t = await getTranslations("seller.fulfillments.detail");
  return { title: t("title", { id: shortShipmentId(shipmentId) }) };
}

// Detalhe da remessa no admin: itens, linha do tempo e as transições do admin (as do fornecedor —
// iniciar preparação, pronta para expedição, cancelar — e as do sistema), todas auditadas (0053).
export default async function SellerShipmentDetailTab({ params }: Props) {
  const { id, shipmentId } = await params;
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  await advanceTransportSimulation();
  const fulfillment = await loadOrgFulfillment(org.id, shipmentId);
  if (!fulfillment) notFound();
  const [t, ts, th, locale] = await Promise.all([getTranslations("seller.fulfillments"), getTranslations("adminCommon.status"), getTranslations("adminOps.sellers.hub"), getLocale()]);
  const status = fulfillment.status;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={sellerHubHref(org.id, "shipments")}>{t("detail.backToList")}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-fg">{t("detail.title", { id: shortShipmentId(fulfillment.id) })}</h2>
          <p className="type-body-sm text-fg-muted">{formatDateTime(fulfillment.created_at, locale as Locale)}</p>
        </div>
        <StatusBadge status={status} label={ts.has(status) ? ts(status) : status} size="md" />
      </div>
      <SellerFulfillmentDetail
        fulfillment={fulfillment}
        actionsTitle={th("shipmentActions")}
        actions={
          <div className="flex flex-col gap-3">
            {isFulfillmentStatus(status) ? (
              <FulfillmentActions orderId={fulfillment.order_id} fulfillmentId={fulfillment.id} status={status} />
            ) : null}
            {adminTargetsFor(status).length > 0 ? <p className="type-caption text-fg-muted">{th("shipmentActionsNote")}</p> : null}
          </div>
        }
        zoneNote={th("zoneNote")}
        asideExtra={
          <Button asChild variant="secondary" size="sm" className="w-fit">
            <Link href={`/admin/orders/${fulfillment.order_id}`}>{th("openOrder")}</Link>
          </Button>
        }
      />
    </div>
  );
}
