import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { CheckoutConfirm } from "@/components/commerce/CheckoutConfirm";
import { CommerceEventTracker } from "@/components/commerce/CommerceEventTracker";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { DestinationSelector } from "@/components/commerce/DestinationSelector";
import { loadCartSnapshot } from "@/components/commerce/server/queries";
import { Badge, Button, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { localizedLabel } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

// Checkout de teste: revisão do resumo + confirmação. Não existe etapa de pagamento.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commerce.checkout");
  return { title: t("title") };
}

export default async function CheckoutPage() {
  await requireUser("/checkout");
  const [snapshot, t, tc, td, locale, supabase] = await Promise.all([
    loadCartSnapshot(),
    getTranslations("commerce.checkout"),
    getTranslations("commerce.cart"),
    getTranslations("commerce.demo"),
    getLocale(),
    createClient(),
  ]);
  const uiLocale = locale as Locale;

  // Kill switch: só reflete a decisão do servidor (checkout_cart também bloqueia).
  const { data: settings } = await supabase.rpc("public_settings");
  const commerceEnabled = !(settings && typeof settings === "object" && !Array.isArray(settings) && (settings as Record<string, unknown>)["commerce.enabled"] === false);

  const visibleLines = snapshot.lines.filter((l) => l.product);
  const expected = visibleLines.map((l) => ({ product_id: l.product_id, price_cents: l.product!.price_cents_demo }));
  const blocking = snapshot.issues.some((i) => i.issue !== "price_changed");

  return (
    <div className="flex flex-col gap-6">
      <CommerceEventTracker event="checkout.start" properties={{ items: snapshot.lines.length, sellers: snapshot.sellerCount, subtotal_cents_demo: snapshot.subtotalCents }} />
      <PageHeader title={t("title")} description={t("description")} eyebrow={<DemoBadge />} backHref="/cart" backLabel={t("backToCart")} />

      {!commerceEnabled ? (
        <DemoNotice tone="warning" live="alert">
          <strong className="font-semibold">{t("disabledTitle")}</strong> — {t("disabledDescription")}
        </DemoNotice>
      ) : null}

      {snapshot.lines.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<ShoppingBag />}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <Button asChild>
                <Link href="/shop">{tc("goToShop")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div className="flex flex-col gap-6">
            <section aria-labelledby="checkout-items" className="rounded-2xl border border-border bg-surface p-5">
              <h2 id="checkout-items" className="type-h3 mb-3 text-fg">
                {t("reviewItems")}
              </h2>
              <ul className="divide-y divide-border">
                {snapshot.groups.map((group) => (
                  <li key={group.sellerId} className="py-3 first:pt-0 last:pb-0">
                    <p className="mb-2 text-sm font-semibold text-fg">{group.sellerName ? tc("sellerGroup", { name: group.sellerName }) : tc("unknownProduct")}</p>
                    <ul className="flex flex-col gap-2">
                      {group.lines.map((line) => (
                        <li key={line.product_id} className="flex items-center gap-3">
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated">
                            {line.product ? <Image src={line.product.image_url} alt="" fill sizes="48px" unoptimized={line.product.image_url.endsWith(".svg")} className="object-cover" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-fg">{line.product?.title ?? tc("unknownProduct")}</p>
                            {line.product ? <p className="type-caption text-fg-muted">{t("itemLine", { qty: line.quantity, price: formatCurrency(line.product.price_cents_demo / 100, uiLocale) })}</p> : null}
                          </div>
                          {line.product ? <p className="type-numeric text-sm font-semibold text-fg">{formatCurrency((line.product.price_cents_demo * line.quantity) / 100, uiLocale)}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="checkout-destination" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
              <h2 id="checkout-destination" className="type-h3 text-fg">
                {t("destination")}
              </h2>
              {snapshot.destination ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-fg">{localizedLabel(snapshot.destination.name, uiLocale)}</span>
                  <Badge variant="neutral" size="sm">
                    {tc(`destination.zone.${snapshot.destination.zone}`)}
                  </Badge>
                  <Badge variant="demo" size="sm">
                    {td("fictional")}
                  </Badge>
                </div>
              ) : (
                <p className="type-body-sm text-warning" role="status">
                  {t("selectDestination")}
                </p>
              )}
              <DestinationSelector destinations={snapshot.destinations} selectedId={snapshot.destination?.id ?? null} compact />
            </section>

            <CheckoutConfirm destinationId={snapshot.destination?.id ?? null} expected={expected} disabled={!commerceEnabled || blocking || visibleLines.length === 0} />
          </div>

          <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-[calc(var(--spacing-topbar)+1rem)]" aria-labelledby="checkout-summary">
            <h2 id="checkout-summary" className="type-h3 text-fg">
              {tc("summaryTitle")}
            </h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t("subtotal")}</dt>
                <dd className="type-numeric font-medium text-fg">{formatCurrency(snapshot.subtotalCents / 100, uiLocale)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{t("shipping")}</dt>
                <dd className="type-numeric font-medium text-fg">
                  {snapshot.shippingCents === null ? <span className="text-fg-muted">{tc("shippingPending")}</span> : snapshot.shippingCents === 0 ? tc("shippingFree") : formatCurrency(snapshot.shippingCents / 100, uiLocale)}
                </dd>
              </div>
              {snapshot.rule ? <p className="type-caption text-fg-muted">{tc("destination.eta", { min: snapshot.rule.eta_days_min, max: snapshot.rule.eta_days_max })}</p> : null}
              <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
                <dt className="font-semibold text-fg">{t("total")}</dt>
                <dd className="type-numeric font-bold text-fg">{snapshot.totalCents === null ? "—" : formatCurrency(snapshot.totalCents / 100, uiLocale)}</dd>
              </div>
            </dl>
            <p className="type-caption text-fg-muted">{td("priceDemo")}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
