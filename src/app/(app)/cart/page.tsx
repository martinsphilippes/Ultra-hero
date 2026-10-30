import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { CartIssuesBanner } from "@/components/commerce/CartIssuesBanner";
import { CartItemRow } from "@/components/commerce/CartItemRow";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { DestinationSelector } from "@/components/commerce/DestinationSelector";
import { loadCartSnapshot } from "@/components/commerce/server/queries";
import { ServiceCartSection } from "@/components/professionals/ServiceCartSection";
import { Button, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { loadServiceCartView } from "@/lib/professionals/cart-view";
import { cartTotals } from "@/lib/professionals/rules";

// Carrinho de teste: itens agrupados por fornecedor, destino fictício, frete simulado e problemas.
// Serviços contratados de profissionais (0058) entram numa seção própria, sem frete nem destino.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commerce.cart");
  return { title: t("title") };
}

export default async function CartPage() {
  await requireUser("/cart");
  const [snapshot, services, t, td, tp, locale] = await Promise.all([
    loadCartSnapshot(),
    loadServiceCartView(),
    getTranslations("commerce.cart"),
    getTranslations("commerce.demo"),
    getTranslations("professionals.cart"),
    getLocale(),
  ]);
  const uiLocale = locale as Locale;
  const issueByProduct = new Map(snapshot.issues.map((i) => [i.product_id, i]));
  const hasProducts = snapshot.lines.length > 0;
  const hasServices = services.items.length > 0;
  const blocking = snapshot.issues.some((i) => i.issue !== "price_changed") || services.blocking;
  const canCheckout = (hasProducts || hasServices) && !blocking;
  const totals = cartTotals({
    productSubtotalCents: snapshot.subtotalCents,
    shippingCents: snapshot.shippingCents,
    hasProducts,
    services: services.items.filter((i) => i.priceCents !== null).map((i) => ({ priceCents: i.priceCents as number })),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={<DemoBadge />} backHref="/shop" backLabel={t("continueShopping")} />
      <DemoNotice>{td("notice")}</DemoNotice>

      {!hasProducts && !hasServices ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<ShoppingBag />}
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
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div className="flex flex-col gap-4">
            <CartIssuesBanner issues={snapshot.issues} />
            {snapshot.groups.map((group) => (
              <section key={group.sellerId} aria-labelledby={`seller-${group.sellerId}`} className="rounded-2xl border border-border bg-surface px-4">
                <header className="flex items-center justify-between gap-3 border-b border-border py-3">
                  <h2 id={`seller-${group.sellerId}`} className="text-sm font-semibold text-fg">
                    {group.sellerName ? t("sellerGroup", { name: group.sellerName }) : t("unknownProduct")}
                  </h2>
                  <p className="type-caption text-fg-muted">{t("itemsCount", { n: group.lines.length })}</p>
                </header>
                <ul className="divide-y divide-border">
                  {group.lines.map((line) => (
                    <CartItemRow
                      key={line.product_id}
                      productId={line.product_id}
                      quantity={line.quantity}
                      product={line.product}
                      fallbackTitle={issueByProduct.get(line.product_id)?.title}
                      hasIssue={issueByProduct.has(line.product_id)}
                    />
                  ))}
                </ul>
                <footer className="flex items-center justify-between gap-3 border-t border-border py-3 text-sm">
                  <span className="text-fg-muted">{t("subtotalSeller")}</span>
                  <span className="type-numeric font-semibold text-fg">{formatCurrency(group.subtotalCents / 100, uiLocale)}</span>
                </footer>
              </section>
            ))}
            {hasServices ? <ServiceCartSection items={services.items} subtotalCents={services.subtotalCents} /> : null}
          </div>

          <aside className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-[calc(var(--spacing-topbar)+1rem)]" aria-labelledby="cart-summary">
            <h2 id="cart-summary" className="type-h3 text-fg">
              {t("summaryTitle")}
            </h2>
            {hasProducts ? <DestinationSelector destinations={snapshot.destinations} selectedId={snapshot.destination?.id ?? null} /> : null}
            <dl className="flex flex-col gap-2 text-sm">
              {hasProducts ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">
                      {t("subtotal")} · {t("sellersCount", { n: snapshot.sellerCount })}
                    </dt>
                    <dd className="type-numeric font-medium text-fg">{formatCurrency(snapshot.subtotalCents / 100, uiLocale)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">{t("shipping")}</dt>
                    <dd className="type-numeric font-medium text-fg">
                      {snapshot.shippingCents === null ? <span className="text-fg-muted">{t("shippingPending")}</span> : snapshot.shippingCents === 0 ? t("shippingFree") : formatCurrency(snapshot.shippingCents / 100, uiLocale)}
                    </dd>
                  </div>
                  {snapshot.rule ? <p className="type-caption text-fg-muted">{t("destination.eta", { min: snapshot.rule.eta_days_min, max: snapshot.rule.eta_days_max })}</p> : null}
                </>
              ) : null}
              {hasServices ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{tp("subtotal")}</dt>
                  <dd className="type-numeric font-medium text-fg">{formatCurrency(totals.servicesCents / 100, uiLocale)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
                <dt className="font-semibold text-fg">{t("total")}</dt>
                <dd className="type-numeric font-bold text-fg">{totals.totalCents === null ? "—" : formatCurrency(totals.totalCents / 100, uiLocale)}</dd>
              </div>
            </dl>
            <Button asChild size="lg" block trailingIcon={<ArrowRight />} disabled={!canCheckout}>
              <Link href="/checkout" aria-disabled={!canCheckout} tabIndex={canCheckout ? undefined : -1} className={canCheckout ? undefined : "pointer-events-none opacity-55"}>
                {t("checkout")}
              </Link>
            </Button>
            <p className="type-caption text-center text-fg-muted">{t("checkoutHint")}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
