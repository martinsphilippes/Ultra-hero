import { Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { EarningsList } from "@/components/finance/EarningsList";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { EARNING_GROUPS, earningTotals, sortEarnings } from "@/lib/finance/earnings";
import { myPayouts } from "@/lib/finance/queries";
import { getTalentContext } from "@/lib/talent/server";

// Ganhos do Hero com a agência (0082): a receber (entregue, não pago), previsão (em produção) e pagos, com a
// situação de cada pagamento e a nota fiscal. Só o cachê do Hero (nunca o valor da marca nem a comissão). Valores
// simulados; o app nativo esconde os valores (regra da 0072).
export async function AgencyEarnings() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const [t, locale, payouts] = await Promise.all([getTranslations("talent.earnings"), getLocale() as Promise<Locale>, myPayouts()]);
  if (!payouts.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Wallet />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const totals = earningTotals(payouts.items);
  const items = sortEarnings(payouts.items);
  return (
    <div className="flex flex-col gap-4" data-testid="office-earnings">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="earnings-totals">
        {EARNING_GROUPS.map((g) => (
          <div key={g} className="flex min-h-20 flex-col justify-center gap-0.5 rounded-2xl border border-border bg-surface p-4" data-group={g}>
            <span className="type-caption font-semibold uppercase tracking-wider text-fg-muted">{t(`groups.${g}`)}</span>
            <span className="font-mono text-xl font-semibold text-fg native:hidden">{formatCents(totals[g].cents, locale)}</span>
            <span className="type-caption text-fg-muted">
              {t(`groupHints.${g}`)} · {t("count", { count: totals[g].count })}
            </span>
          </div>
        ))}
      </div>
      <p className="type-caption text-fg-muted hidden native:block">{t("appHint")}</p>
      {items.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p> : <EarningsList items={items} />}
      <p className="type-caption text-fg-muted">{t("simulated")}</p>
    </div>
  );
}
