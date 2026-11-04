import { Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import { installmentState, openCents, type ClientReceivable } from "@/lib/finance/client-payments";
import { ClientInstallmentButton } from "./ClientInstallmentButton";

const STATE_VARIANT: Record<ReturnType<typeof installmentState>, BadgeVariant> = { paid: "success", late: "danger", today: "warning", open: "neutral", forecast: "info" };

// Herói-cliente (0111, D5): o herói vê o "a pagar" à agência (assessoria, mentoria, business plan…); o Adm vê o
// "a receber" dos heróis e marca cada parcela recebida. Sem comissão nem nada interno. Registro simulado.
export async function ClientPayments({ items, side, today }: { items: ClientReceivable[]; side: "talent" | "agency"; today: string }) {
  if (items.length === 0) return null;
  const [t, tm, locale] = await Promise.all([getTranslations("payments.client"), getTranslations("payments.plan.method"), getLocale() as Promise<Locale>]);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby={`client-pay-${side}`} data-testid={`client-payments-${side}`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`client-pay-${side}`} className="flex items-center gap-2 text-base font-semibold text-fg">
          <Wallet className="size-4" aria-hidden="true" />
          {side === "talent" ? t("heroTitle") : t("agencyTitle")}
        </h2>
        <p className="type-caption text-fg-muted">{side === "talent" ? t("heroHint") : t("agencyHint")}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {items.map((r) => (
          <li key={r.entryId} className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="client-payment">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {side === "agency" ? (
                <Link href={`/agencia/negocios/${r.dealId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
                  {r.title}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-fg">{r.title}</span>
              )}
              <span className="font-mono text-sm font-semibold text-fg">{formatCents(r.totalCents, locale)}</span>
            </div>
            <p className="type-caption text-fg-muted">
              {side === "agency" ? r.talentName : r.agencyName}
              {r.method ? ` · ${tm(r.method)}${r.method === "other" && r.methodNote ? ` (${r.methodNote})` : ""}` : ""}
              {r.entryStatus === "forecast" ? ` · ${t("forecast")}` : r.entryStatus === "settled" ? ` · ${t("settled")}` : ` · ${t("openLeft", { amount: formatCents(openCents(r), locale) })}`}
            </p>
            <ul className="flex flex-col divide-y divide-border">
              {r.installments.map((i) => {
                const st = installmentState(r.entryStatus, i, today);
                return (
                  <li key={i.id} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                    <span className="w-8 shrink-0 type-caption text-fg-muted">{t("seq", { n: i.seq })}</span>
                    <span className="flex-1 text-fg">{i.dueOn ? formatPlainDate(i.dueOn, locale) : "—"}</span>
                    <span className="font-mono text-fg">{formatCents(i.amountCents, locale)}</span>
                    <Badge size="sm" variant={STATE_VARIANT[st]}>
                      {t(`states.${st}`)}
                    </Badge>
                    {side === "agency" && r.entryStatus !== "forecast" ? <ClientInstallmentButton installmentId={i.id} paid={i.status === "paid"} /> : null}
                  </li>
                );
              })}
            </ul>
            {r.notes ? <p className="whitespace-pre-line type-caption text-fg-muted">“{r.notes}”</p> : null}
          </li>
        ))}
      </ul>
      <p className="type-caption text-fg-subtle">{t("simulated")}</p>
    </section>
  );
}
