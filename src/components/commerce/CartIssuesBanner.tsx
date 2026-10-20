"use client";

import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acceptNewPrices, removeProblematicItems } from "@/app/(app)/cart/actions";
import type { CartIssue } from "@/components/commerce/lib/errors";
import { Button, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";

type Props = { issues: CartIssue[] };

// Faixa de problemas do carrinho (cart_validate) com atalhos: remover itens / aceitar preços.
export function CartIssuesBanner({ issues }: Props) {
  const t = useTranslations("commerce.cart.issues");
  const te = useTranslations("commerce.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  if (issues.length === 0) return null;

  const problematic = issues.filter((i) => i.issue !== "price_changed");
  const priceChanges = issues.filter((i) => i.issue === "price_changed");

  function removeAll() {
    startTransition(async () => {
      const result = await removeProblematicItems({ productIds: problematic.map((i) => i.product_id) });
      if (result.ok) {
        toast({ title: t("resolved"), variant: "success" });
        router.refresh();
      } else toast({ title: te("generic"), variant: "error" });
    });
  }

  function accept() {
    startTransition(async () => {
      const result = await acceptNewPrices({ issues: priceChanges.map((i) => ({ product_id: i.product_id, new_price: i.new_price })) });
      if (result.ok) {
        toast({ title: t("resolved"), variant: "success" });
        router.refresh();
      } else toast({ title: te("generic"), variant: "error" });
    });
  }

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-fg">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("title")}</p>
          <p className="type-body-sm text-fg-muted">{t("description")}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 pl-8 text-sm">
        {issues.map((issue) => (
          <li key={`${issue.product_id}-${issue.issue}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{issue.title}</span>
            <span className="text-fg-muted">
              {issue.issue === "price_changed"
                ? t("price_changed", { old: formatCurrency((issue.old_price ?? 0) / 100, locale), new: formatCurrency((issue.new_price ?? 0) / 100, locale) })
                : t(issue.issue)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pl-8">
        {problematic.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={removeAll} loading={pending}>
            {t("removeProblematic")}
          </Button>
        ) : null}
        {priceChanges.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={accept} loading={pending}>
            {t("acceptPrices")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
