import { getLocale, getTranslations } from "next-intl/server";
import { getNativeApp } from "@/lib/native-app/server";
import type { EvolutionSummary } from "@/lib/routine/evolution-summary";
import type { WatchView } from "@/lib/wearables/context";
import { ymdToDate } from "../dates";
import { LegacyTodayCleanup } from "./LegacyTodayCleanup";
import { TodayHub } from "./TodayHub";

type Props = {
  /** Data local de hoje (YYYY-MM-DD) no fuso do perfil (ou UTC). */
  localDate: string;
  view: WatchView;
  evolution: EvolutionSummary;
};

// "Hoje — Seu dia, em foco" no Perfil: 3 cards (Seu dia, Sua noite, Evolução) que abrem telas.
// Seu dia/Sua noite: só o que o relógio mede sozinho (nada para digitar). Conta demo → relógio
// simulado da persona; conta real → "Conectar relógio" com "Ver um exemplo" ou, com
// WEARABLES_REAL_ENABLED=1 e relógio conectado, os dados reais ("Sincronizando…" até o 1º).
// Evolução: sequência, "Continue seus programas" e "Você vs Hero".
export async function TodaySection({ localDate, view, evolution }: Props) {
  // App das lojas: sem relógio simulado (dados de saúde inventados sem o aviso de demonstração
  // confundiriam); lá ficam só os cards do relógio real/conectar e a Evolução.
  const hideWatch = (view.kind === "demo" || view.kind === "example") && Boolean(await getNativeApp());
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
        <p className="type-body-sm max-w-prose text-fg-muted">{hideWatch ? t("hub.descriptionNoWatch") : view.kind === "connect" ? ((view.providers?.length ?? 0) > 0 ? t("descriptionConnectAvailable") : t("descriptionConnect")) : t("description")}</p>
      </div>
      <TodayHub view={view} evolution={evolution} hideWatch={hideWatch} />
    </section>
  );
}
