"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmCheckout } from "@/app/(app)/checkout/actions";
import type { CartIssue } from "@/components/commerce/lib/errors";
import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";

type Props = {
  destinationId: string | null;
  /** Preços ilustrativos exibidos no resumo (product_id → centavos). */
  expected: { product_id: string; price_cents: number }[];
  /** Serviços do carrinho com o preço exibido (0058); vazio = só produtos. */
  services?: { service_id: string; price_cents: number }[];
  /** Destino só é exigido quando há produto (serviço não tem entrega). */
  needsDestination?: boolean;
  disabled?: boolean;
};

// Botão de confirmação do pedido de teste + tratamento de cart_changed (diff e aceite de preços).
export function CheckoutConfirm({ destinationId, expected, services = [], needsDestination = true, disabled }: Props) {
  const t = useTranslations("commerce.checkout");
  const tc = useTranslations("commerce.cart.issues");
  const te = useTranslations("commerce.errors");
  const tp = useTranslations("professionals.checkout.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issues, setIssues] = useState<CartIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onlyPriceChanges = issues !== null && issues.length > 0 && issues.every((i) => i.issue === "price_changed");

  function run(acceptChanges: boolean, prices: { product_id: string; price_cents: number }[]) {
    if (needsDestination && !destinationId) {
      setError(te("invalid_destination"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await confirmCheckout({ destinationId, expected: prices, acceptChanges, services });
      if (result.ok) {
        // com serviços: Minhas compras na aba Serviços (o pedido de produtos também fica lá, em Pedidos)
        router.push(result.serviceOrders > 0 ? "/shop/compras?aba=servicos&novo=1" : `/orders/${result.orderId}?new=1`);
        return;
      }
      if (result.error === "cart_changed" && "issues" in result) {
        setIssues(result.issues);
        return;
      }
      setIssues(null);
      setError(tp.has(result.error) ? tp(result.error) : te.has(result.error) ? te(result.error) : te("generic"));
    });
  }

  function acceptAndConfirm() {
    if (!issues) return;
    const next = new Map(expected.map((e) => [e.product_id, e.price_cents]));
    for (const i of issues) if (typeof i.new_price === "number") next.set(i.product_id, i.new_price);
    run(true, Array.from(next, ([product_id, price_cents]) => ({ product_id, price_cents })));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-2xl border border-info/30 bg-info-soft p-4 text-fg" role="note">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("statement")}</p>
          <p className="type-body-sm text-fg-muted">{t("statementDetail")}</p>
        </div>
      </div>

      {issues && issues.length > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-fg">
          <div>
            <p className="font-semibold">{t("changed.title")}</p>
            <p className="type-body-sm text-fg-muted">{t("changed.description")}</p>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {issues.map((issue) => (
              <li key={`${issue.product_id}-${issue.issue}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{issue.title}</span>
                <span className="text-fg-muted">
                  {issue.issue === "price_changed"
                    ? tc("price_changed", { old: formatCurrency((issue.old_price ?? 0) / 100, locale), new: formatCurrency((issue.new_price ?? 0) / 100, locale) })
                    : tc(issue.issue)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {onlyPriceChanges ? (
              <Button type="button" onClick={acceptAndConfirm} loading={pending}>
                {t("changed.acceptNewPrices")}
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href="/cart">{t("changed.fixInCart")}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="type-body-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/cart">{t("backToCart")}</Link>
        </Button>
        <Button type="button" size="lg" leadingIcon={<CheckCircle2 />} onClick={() => run(false, expected)} loading={pending} disabled={disabled || (needsDestination && !destinationId) || (issues !== null && issues.length > 0)}>
          {t("confirm")}
        </Button>
      </div>
    </div>
  );
}
