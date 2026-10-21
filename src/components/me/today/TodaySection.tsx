import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { ProgramSuggestion } from "@/lib/routine/today";
import { ymdToDate } from "../dates";
import { HydrationBlock } from "./HydrationBlock";
import { RestBlock } from "./RestBlock";
import { RhythmBlock, type RhythmItem } from "./RhythmBlock";

type Props = {
  /** Data local de hoje (YYYY-MM-DD) no fuso do perfil (ou UTC). */
  localDate: string;
  suggestions: ProgramSuggestion[];
  items: RhythmItem[];
};

// "Hoje" no topo do Perfil: ritmo do dia (programas + itens manuais, no banco) e registros locais
// de hidratação e descanso (só no aparelho). A data vem pronta do servidor para não depender do relógio do cliente.
export async function TodaySection({ localDate, suggestions, items }: Props) {
  const [t, locale] = await Promise.all([getTranslations("me.today"), getLocale()]);
  const uiLocale = locale as Locale;
  const dateLabel = new Intl.DateTimeFormat(uiLocale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(ymdToDate(localDate));

  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-4" data-testid="today-section">
      <div className="flex flex-col gap-1">
        <p className="type-overline text-accent-text">
          <time dateTime={localDate}>{t("eyebrow", { date: dateLabel })}</time>
        </p>
        <h2 id="today-title" className="type-h2 text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm max-w-prose text-fg-muted">{t("description")}</p>
      </div>
      <RhythmBlock suggestions={suggestions} items={items} />
      <div className="grid gap-4 md:grid-cols-2">
        <HydrationBlock localDate={localDate} locale={uiLocale} />
        <RestBlock localDate={localDate} />
      </div>
    </section>
  );
}
