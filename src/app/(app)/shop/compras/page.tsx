import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { MyBidsList } from "@/components/collectibles/MyBidsList";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { OrdersList } from "@/components/commerce/OrdersList";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { DemoBadge, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { requireUser } from "@/lib/auth/session";
import { fetchMyBids } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Minhas compras (dentro da aba Comprar): pedidos de teste e, com a 0057, "Lances e arremates"
// (situação de cada item em que a pessoa deu lance; arrematado mostra o valor final, sem pagamento).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectibles.purchases");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MyPurchasesPage({ searchParams }: Props) {
  const user = await requireUser("/shop/compras");
  const params = await searchParams;
  await advanceTransportSimulation();
  const [t, to, supabase] = await Promise.all([getTranslations("collectibles.purchases"), getTranslations("commerce.orders"), createClient()]);
  const myBids = await fetchMyBids(supabase);
  const tab = myBids.available && params.aba === "lances" ? "bids" : "orders";

  const tabs = [
    { key: "orders", href: "/shop/compras", label: t("tabs.orders") },
    { key: "bids", href: "/shop/compras?aba=lances", label: t("tabs.bids") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/shop">{t("back")}</BackLink>
      <PageHeader title={t("title")} description={t("description")} eyebrow={<DemoBadge />} />
      {myBids.available ? (
        <nav aria-label={t("tabsLabel")}>
          <ul className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface-elevated p-1 sm:w-fit sm:min-w-[24rem]">
            {tabs.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={tab === item.key ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                    tab === item.key ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {item.label}
                  {item.key === "bids" && myBids.rows.length > 0 ? <span className="ml-1.5 type-numeric text-xs text-fg-subtle">{myBids.rows.length}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {tab === "orders" ? (
        <section aria-label={t("tabs.orders")} className="flex flex-col gap-4" data-testid="purchases-orders">
          <DemoNotice>{to("banner")}</DemoNotice>
          <OrdersList userId={user.id} />
        </section>
      ) : (
        <section aria-label={t("tabs.bids")} className="flex flex-col gap-4" data-testid="purchases-bids">
          <MyBidsList rows={myBids.rows} serverNow={Date.now()} />
        </section>
      )}
    </div>
  );
}
