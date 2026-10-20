import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";
import { StatusBadge } from "@/components/admin";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { Button, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Lista de pedidos de teste do usuário. Antes de consultar, avança a simulação de transporte.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commerce.orders");
  return { title: t("title") };
}

type OrderRow = {
  id: string;
  status: string;
  confirmed_at: string;
  total_cents: number;
  retention_expires_at: string;
  anonymized_at: string | null;
  items: { count: number }[];
};

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  await advanceTransportSimulation();
  const [t, ts, locale, supabase] = await Promise.all([getTranslations("commerce.orders"), getTranslations("adminCommon.status"), getLocale(), createClient()]);
  const { data, error } = await supabase
    .from("test_orders")
    .select("id, status, confirmed_at, total_cents, retention_expires_at, anonymized_at, items:test_order_items(count)")
    .eq("user_id", user.id)
    .order("confirmed_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as unknown as OrderRow[];
  const uiLocale = locale as Locale;
  const currency = new Intl.NumberFormat(uiLocale, { style: "currency", currency: "BRL" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={<DemoBadge />} />
      <DemoNotice>{t("banner")}</DemoNotice>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<ReceiptText />}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <Button asChild>
                <Link href="/shop">{t("goToShop")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t("listLabel")}>
          {orders.map((order) => {
            const short = order.id.slice(0, 8).toUpperCase();
            const count = order.items?.[0]?.count ?? 0;
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  aria-label={t("viewDetail", { id: short })}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">
                        {t("order")} <span className="type-numeric">{t("orderShort", { id: short })}</span>
                      </span>
                      <StatusBadge status={order.status} label={ts.has(order.status) ? ts(order.status) : order.status} />
                    </div>
                    <p className="type-caption text-fg-muted">
                      {t("date")} <time dateTime={order.confirmed_at}>{formatDateTime(order.confirmed_at, uiLocale)}</time> · {t("itemsCount", { n: count })}
                    </p>
                    <p className="type-caption text-fg-subtle">{t("retention", { date: formatDate(order.retention_expires_at, uiLocale) })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="type-caption text-fg-muted">{t("total")}</p>
                      <p className="type-numeric font-bold text-fg">{currency.format(order.total_cents / 100)}</p>
                    </div>
                    <ChevronRight className="size-5 text-fg-muted" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
