import { getLocale, getTranslations } from "next-intl/server";
import type { WatchView } from "@/lib/wearables/context";
import { ymdToDate } from "../dates";
import { ConnectWatchCard } from "./ConnectWatchCard";
import { LegacyTodayCleanup } from "./LegacyTodayCleanup";
import { WatchToday } from "./WatchToday";

type Props = {
  /** Data local de hoje (YYYY-MM-DD) no fuso do perfil (ou UTC). */
  localDate: string;
  view: WatchView;
};

// "Hoje — Seu dia, em foco" no topo do Perfil: só o que o relógio mede sozinho (nada para digitar).
// Conta demo → relógio simulado da persona; conta real → card "Conectar relógio" com "Ver um exemplo".
export async function TodaySection({ localDate, view }: Props) {
  const [t, locale] = await Promise.all([getTranslations("me.today"), getLocale()]);
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(ymdToDate(localDate));

  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-4" data-testid="today-section">
      <LegacyTodayCleanup />
      <div className="flex flex-col gap-1">
        <p className="type-overline text-accent-text">
          <time dateTime={localDate}>{t("eyebrow", { date: dateLabel })}</time>
        </p>
        <h2 id="today-title" className="type-h2 text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm max-w-prose text-fg-muted">{t("description")}</p>
      </div>
      {view.kind === "connect" ? <ConnectWatchCard /> : <WatchToday snapshot={view.snapshot} mode={view.kind} />}
    </section>
  );
}
