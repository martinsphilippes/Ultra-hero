import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import type { ReactNode } from "react";
import { MapPinOff } from "lucide-react";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { OrderTimeline, type FulfillmentEvent } from "@/components/commerce/OrderTimeline";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";

export type OrgFulfillment = {
  id: string;
  order_id: string;
  status: string;
  destination_zone: string;
  eta_days: number | null;
  shipping_cents_snapshot: number;
  created_at: string;
  items: { id: string; title_snapshot: string; image_snapshot: string | null; price_cents_snapshot: number; quantity: number }[];
  events: FulfillmentEvent[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Remessa da organização (RLS: fornecedor só a própria; admin qualquer). null = não existe/fora do recorte.
export async function loadOrgFulfillment(orgId: string, id: string): Promise<OrgFulfillment | null> {
  if (!UUID_RE.test(id) || !UUID_RE.test(orgId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("test_fulfillments")
    .select(
      "id, order_id, status, destination_zone, eta_days, shipping_cents_snapshot, created_at, " +
        "items:test_order_items(id, title_snapshot, image_snapshot, price_cents_snapshot, quantity), " +
        "events:fulfillment_events(id, from_status, to_status, actor_type, note, created_at)",
    )
    .eq("id", id)
    .eq("seller_org_id", orgId)
    .maybeSingle();
  const row = (data as unknown as OrgFulfillment | null) ?? null;
  if (!row) return null;
  return { ...row, events: [...row.events].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
}

type Props = {
  fulfillment: OrgFulfillment;
  actionsTitle: string;
  /** Botões de transição (fornecedor ou admin). */
  actions: ReactNode;
  zoneNote: string;
  /** Conteúdo extra no fim da coluna lateral (ex.: link do pedido no admin). */
  asideExtra?: ReactNode;
};

// Corpo do detalhe da remessa: itens, ações, linha do tempo e zona fictícia.
export async function SellerFulfillmentDetail({ fulfillment, actionsTitle, actions, zoneNote, asideExtra }: Props) {
  const [t, tc, locale] = await Promise.all([getTranslations("seller.fulfillments"), getTranslations("commerce.cart.destination"), getLocale()]);
  const uiLocale = locale as Locale;
  const zone = fulfillment.destination_zone;
  const zoneLabel = zone === "local" || zone === "regional" || zone === "national" ? tc(`zone.${zone}`) : zone;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="f-items" className="rounded-2xl border border-border bg-surface p-5">
          <h2 id="f-items" className="type-h3 mb-3 text-fg">
            {t("detail.items")}
          </h2>
          <ul className="divide-y divide-border">
            {fulfillment.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated">
                  {item.image_snapshot ? <Image src={item.image_snapshot} alt="" fill sizes="48px" unoptimized={item.image_snapshot.endsWith(".svg")} className="object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-fg">{item.title_snapshot}</p>
                  <p className="type-caption text-fg-muted">
                    {t("detail.quantity")} {item.quantity} × <span className="type-numeric">{formatCurrency(item.price_cents_snapshot / 100, uiLocale)}</span>
                  </p>
                </div>
                <p className="type-numeric text-sm font-semibold text-fg">{formatCurrency((item.price_cents_snapshot * item.quantity) / 100, uiLocale)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="f-actions" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="fulfillment-actions">
          <h2 id="f-actions" className="type-h3 text-fg">
            {actionsTitle}
          </h2>
          {actions}
        </section>

        <section aria-labelledby="f-timeline" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 id="f-timeline" className="type-h3 text-fg">
            {t("detail.timeline")}
          </h2>
          <OrderTimeline events={fulfillment.events} label={t("detail.timeline")} />
        </section>
      </div>

      <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" aria-labelledby="f-summary">
        <h2 id="f-summary" className="type-h3 text-fg">
          {t("detail.zoneLabel")}
        </h2>
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
          {zoneLabel}
          <Badge variant="demo" size="sm" icon={<MapPinOff />}>
            {tc("label")}
          </Badge>
        </p>
        <DemoNotice tone="info">{zoneNote}</DemoNotice>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("columns.eta")}</dt>
            <dd className="font-medium text-fg">{fulfillment.eta_days !== null ? t("etaDays", { n: fulfillment.eta_days }) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("detail.shippingShare")}</dt>
            <dd className="type-numeric font-medium text-fg">{formatCurrency(fulfillment.shipping_cents_snapshot / 100, uiLocale)}</dd>
          </div>
        </dl>
        {asideExtra}
      </aside>
    </div>
  );
}
