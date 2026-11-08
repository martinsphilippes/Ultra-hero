import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { compensationKinds, isMoneyOnly, type Compensation } from "@/lib/compensation/model";
import { formatCents } from "@/lib/deals/schemas";
import { cn } from "@/lib/utils";

type Props = {
  compensation: Compensation;
  /** Quem lê valores (marca, Adm). Sem permissão: o tipo e as descrições, nunca os números (R$ ou %). */
  canValues?: boolean;
  /** Mostra as etiquetas mesmo quando é só valor (o padrão esconde: nada muda nas telas antigas). */
  always?: boolean;
  className?: string;
};

/**
 * Leitura da forma de pagamento (0140): etiquetas (Valor · Permuta · Performance) e, abaixo, o que é oferecido em
 * permuta e a regra da performance. Só valor (o caso de sempre) não mostra nada, a não ser com `always`.
 */
export function CompensationView({ compensation: c, canValues = true, always = false, className }: Props) {
  const t = useTranslations("compensation.view");
  const tk = useTranslations("compensation.kinds");
  const locale = useLocale();
  if (isMoneyOnly(c) && !always) return null;
  const money = (cents: number) => formatCents(cents, locale);
  const pct = (rate: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate);
  const p = c.performance;
  const rule = p
    ? canValues
      ? p.kind === "percent"
        ? t("perfPercent", { rate: pct(p.rate) })
        : t(p.kind === "per_sale" ? "perfPerSale" : "perfPerLead", { value: money(p.rate) })
      : t(`perfKindOnly.${p.kind}`)
    : "";

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="compensation-view">
      <div className="flex flex-wrap items-center gap-1.5">
        {compensationKinds(c).map((k) => (
          <Badge key={k} variant={k === "money" ? "neutral" : "accent"} data-testid={`compensation-kind-${k}`}>
            {tk(k)}
          </Badge>
        ))}
        {!c.money ? <span className="type-caption text-fg-muted">{t("noMoney")}</span> : null}
      </div>
      {c.barter ? (
        <p className="type-body-sm text-fg" data-testid="compensation-barter">
          <span className="font-semibold">{tk("barter")}:</span> {c.barter.offer}
          {canValues && c.barter.valueCents ? <span className="text-fg-muted"> · {t("barterValue", { value: money(c.barter.valueCents) })}</span> : null}
        </p>
      ) : null}
      {p ? (
        <p className="type-body-sm text-fg" data-testid="compensation-performance">
          <span className="font-semibold">{tk("performance")}:</span> {rule}
          {p.measure ? <span className="text-fg-muted"> · {t("perfMeasure", { measure: p.measure })}</span> : null}
          {canValues && p.estimateCents ? <span className="text-fg-muted"> · {t("perfEstimate", { value: money(p.estimateCents) })}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
