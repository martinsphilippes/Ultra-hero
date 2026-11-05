import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { ceilingCents, type ValueModel } from "@/lib/value-model/model";

type Props = {
  model: ValueModel;
  amountCents: number | null;
  maxHeroes: number | null;
  /** Quem lê valores (marca, Adm). Gestor e Hero veem só o modelo e o máximo, nunca o dinheiro. */
  canValues?: boolean;
  className?: string;
};

/**
 * Leitura do valor oferecido (0096). Por Hero: "Até R$ X" em destaque e, abaixo, "R$ A por Hero · máximo N Heros".
 * Fixo: o valor total e a dica de que se divide entre os Heros. Sem permissão para valores, só o modelo e o máximo.
 */
export function ValueTermsView({ model, amountCents, maxHeroes, canValues = true, className }: Props) {
  const t = useTranslations("valueModel.view");
  const locale = useLocale() as Locale;
  const ceiling = ceilingCents({ model, amountCents, maxHeroes });
  return (
    <span className={className ?? "flex flex-col"} data-testid="value-terms">
      {model === "por_heroi" ? (
        canValues && amountCents !== null && ceiling !== null ? (
          <>
            <strong className="text-base font-semibold text-fg">{t("ceiling", { value: formatCents(ceiling, locale) })}</strong>
            <span className="type-caption text-fg-muted">{t("perHeroDetail", { value: formatCents(amountCents, locale), n: maxHeroes ?? 0 })}</span>
          </>
        ) : (
          <>
            <strong className="text-sm font-semibold text-fg">{t("perHero")}</strong>
            <span className="type-caption text-fg-muted">{t("maxOnly", { n: maxHeroes ?? 0 })}</span>
          </>
        )
      ) : canValues && amountCents !== null ? (
        <>
          <strong className="text-base font-semibold text-fg">{formatCents(amountCents, locale)}</strong>
          <span className="type-caption text-fg-muted">{t("fixedDetail")}</span>
        </>
      ) : (
        <>
          <strong className="text-sm font-semibold text-fg">{t("fixed")}</strong>
          <span className="type-caption text-fg-muted">{t("fixedDetail")}</span>
        </>
      )}
    </span>
  );
}
