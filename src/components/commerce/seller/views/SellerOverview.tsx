import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Building2, Package, Truck } from "lucide-react";
import { StatusBadge } from "@/components/admin";
import { Button, Card, CardBody } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { countByStatus, OPEN_FULFILLMENT_STATUSES } from "@/lib/seller-ops/shipments";
import { createClient } from "@/lib/supabase/server";

type ModerationRow = { id: string; action: "hide" | "suspend" | "clear"; reason: string | null; created_at: string; product: { id: string; title: string } | null };

export type OverviewLinks = {
  products: string;
  fulfillments: string;
  profile: string;
  /** Edição de um produto (moderação recente). */
  productEdit: (productId: string) => string;
  /** Lista de remessas já filtrada por status (admin); sem isto, os números não viram link. */
  fulfillmentsByStatus?: (status: string) => string;
};

// Visão geral de uma organização: produtos por status, remessas abertas e moderação recente.
// Usada no painel do fornecedor (/seller) e na aba Visão geral da organização no admin.
// A leitura respeita a RLS (fornecedor: só a própria; admin: qualquer).
export async function SellerOverview({ orgId, links }: { orgId: string; links: OverviewLinks }) {
  const [t, ts, locale] = await Promise.all([getTranslations("seller.dashboard"), getTranslations("adminCommon.status"), getLocale()]);
  const supabase = await createClient();
  const [{ data: products }, { data: fulfillments }, { data: moderationRaw }] = await Promise.all([
    supabase.from("products").select("status").eq("seller_org_id", orgId),
    supabase.from("test_fulfillments").select("status").eq("seller_org_id", orgId).in("status", [...OPEN_FULFILLMENT_STATUSES]),
    supabase
      .from("product_moderation")
      .select("id, action, reason, created_at, product:products!inner(id, title, seller_org_id)")
      .eq("product.seller_org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const byStatus = countByStatus(products, ["published", "draft", "archived"] as const);
  const byFulfillment = countByStatus(fulfillments, OPEN_FULFILLMENT_STATUSES);
  const moderation = (moderationRaw ?? []) as unknown as ModerationRow[];
  const fulfillmentLabel = { awaiting: t("awaiting"), preparing: t("preparing"), ready_for_dispatch: t("readyForDispatch") } as const;

  return (
    <div className="flex flex-col gap-6" data-testid="seller-overview">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="type-h3 flex items-center gap-2 text-fg">
              <Package className="size-5 text-accent-text" aria-hidden="true" />
              {t("productsTitle")}
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {(["published", "draft", "archived"] as const).map((s) => (
                <div key={s} className="rounded-xl border border-border bg-surface-elevated p-3">
                  <dt className="type-caption text-fg-muted">{ts(s)}</dt>
                  <dd className="type-numeric text-2xl font-bold text-fg">{byStatus[s]}</dd>
                </div>
              ))}
            </dl>
            <Button asChild variant="link" className="mt-3 w-fit">
              <Link href={links.products}>{t("manageProducts")}</Link>
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="type-h3 flex items-center gap-2 text-fg">
              <Truck className="size-5 text-accent-text" aria-hidden="true" />
              {t("fulfillmentsTitle")}
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {OPEN_FULFILLMENT_STATUSES.map((s) => (
                <div key={s} className="rounded-xl border border-border bg-surface-elevated p-3" data-testid={`overview-fulfillments-${s}`}>
                  <dt className="type-caption text-fg-muted">{fulfillmentLabel[s]}</dt>
                  <dd className="type-numeric text-2xl font-bold text-fg">
                    {links.fulfillmentsByStatus ? (
                      <Link
                        href={links.fulfillmentsByStatus(s)}
                        className="rounded-md underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        aria-label={`${fulfillmentLabel[s]}: ${byFulfillment[s]}`}
                      >
                        {byFulfillment[s]}
                      </Link>
                    ) : (
                      byFulfillment[s]
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <Button asChild variant="link" className="mt-3 w-fit">
              <Link href={links.fulfillments}>{t("manageFulfillments")}</Link>
            </Button>
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby={`overview-moderation-${orgId}`} className="flex flex-col gap-3">
        <h2 id={`overview-moderation-${orgId}`} className="type-h2 text-fg">
          {t("moderationTitle")}
        </h2>
        {moderation.length === 0 ? (
          <p className="type-body-sm rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-fg-muted">{t("moderationEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {moderation.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <StatusBadge status={m.action === "hide" ? "hidden" : m.action === "suspend" ? "suspended" : "clear"} label={t(`moderationAction.${m.action}`)} />
                <div className="min-w-0 flex-1">
                  {m.product ? (
                    <Link href={links.productEdit(m.product.id)} className="text-sm font-medium text-fg underline-offset-4 hover:underline">
                      {m.product.title}
                    </Link>
                  ) : null}
                  {m.reason ? <p className="type-caption text-fg-muted">{m.reason}</p> : null}
                </div>
                <time dateTime={m.created_at} className="type-caption text-fg-muted">
                  {formatDateTime(m.created_at, locale as Locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`overview-shortcuts-${orgId}`} className="flex flex-col gap-3">
        <h2 id={`overview-shortcuts-${orgId}`} className="type-h2 text-fg">
          {t("quickLinks")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" leadingIcon={<Package />}>
            <Link href={links.products}>{t("manageProducts")}</Link>
          </Button>
          <Button asChild variant="secondary" leadingIcon={<Truck />}>
            <Link href={links.fulfillments}>{t("manageFulfillments")}</Link>
          </Button>
          <Button asChild variant="secondary" leadingIcon={<Building2 />}>
            <Link href={links.profile}>{t("editProfile")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
