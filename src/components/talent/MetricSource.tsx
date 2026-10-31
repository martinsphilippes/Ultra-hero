import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { isStale, type DeclaredSide } from "@/lib/talent/media-kit";

type Props = { asOf: string; side: DeclaredSide; declaredAt?: string | null; className?: string };

// "dados de 20/10/2026 · declarado por creator em 21/10/2026" (critério 2 da etapa B): toda métrica
// mostra a data do dado e quem declarou. Sem integração real: nunca "verificado".
export function MetricSource({ asOf, side, declaredAt, className }: Props) {
  const t = useTranslations("mediaKit.source");
  const locale = useLocale() as Locale;
  const date = formatPlainDate(asOf, locale);
  const by = t(`side.${side}`);
  return (
    <p className={className ?? "type-caption text-fg-muted"} data-testid="metric-source">
      {declaredAt ? t("label", { date, by, declaredAt: formatPlainDate(declaredAt.slice(0, 10), locale) }) : t("labelShort", { date, by })}
      {isStale(asOf) ? <span className="ml-1 font-medium text-warning">· {t("stale")}</span> : null}
    </p>
  );
}
