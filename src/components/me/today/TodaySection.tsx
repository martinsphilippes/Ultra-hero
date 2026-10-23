import { getLocale, getTranslations } from "next-intl/server";
import type { WatchView } from "@/lib/wearables/context";
import { ymdToDate } from "../dates";
import { ConnectWatchCard } from "./ConnectWatchCard";
import { LegacyTodayCleanup } from "./LegacyTodayCleanup";
import { SyncingCard } from "./SyncingCard";
import { WatchToday } from "./WatchToday";

type Props = {
  /** Data local de hoje (YYYY-MM-DD) no fuso do perfil (ou UTC). */
  localDate: string;
  view: WatchView;
};

// "Hoje — Seu dia, em foco" no topo do Perfil: só o que o relógio mede sozinho (nada para digitar).
// Conta demo → relógio simulado da persona; conta real → card "Conectar relógio" com "Ver um exemplo"
// ou, com WEARABLES_REAL_ENABLED=1 e relógio conectado, os dados reais ("Sincronizando…" até o 1º).
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
        {/* sem relógio, não prometer "medido pelo seu relógio" */}
        <p className="type-body-sm max-w-prose text-fg-muted">{view.kind === "connect" ? t("descriptionConnect") : t("description")}</p>
      </div>
      {view.kind === "connect" ? (
        <ConnectWatchCard providers={view.providers} />
      ) : view.kind === "syncing" ? (
        <SyncingCard provider={view.provider} deviceName={view.deviceName} />
      ) : view.kind === "real" ? (
        <WatchToday snapshot={view.snapshot} mode="real" lastSync={view.lastSync} stale={view.stale} />
      ) : (
        <WatchToday snapshot={view.snapshot} mode={view.kind} />
      )}
    </section>
  );
}
