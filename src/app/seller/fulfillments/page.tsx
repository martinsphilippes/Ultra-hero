import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { SellerFulfillmentsView } from "@/components/commerce/seller/views/SellerFulfillmentsView";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { PageHeader } from "@/components/ui";
import { getSellerContext } from "../_lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.fulfillments");
  return { title: t("title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Remessas da organização ativa (RLS garante o recorte; a UI filtra por org por clareza).
export default async function SellerFulfillmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const [ctx, params, t, tn] = await Promise.all([getSellerContext(), searchParams, getTranslations("seller.fulfillments"), getTranslations("nav.seller")]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;
  await advanceTransportSimulation();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description", { name: ctx.org.name })} backHref="/seller" backLabel={tn("dashboard")} />
      <SellerHeader ctx={ctx} />
      <DemoNotice>{t("detail.systemNote")}</DemoNotice>
      <SellerFulfillmentsView orgId={ctx.org.id} base="/seller/fulfillments" params={params} />
    </div>
  );
}
