import { ChevronRight, Flame, Moon, Sun } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { heroComparisonScreen } from "@/components/heroes/HeroComparison";
import { Button } from "@/components/ui";
import { ScreenCards, type Screen, type ScreenCard } from "@/components/ui/screen-cards";
import type { EvolutionSummary } from "@/lib/routine/evolution-summary";
import { evolutionTeaserParts, joinTeaser, todayCardKeys, type TodayCardKey, type WatchCardsState } from "@/lib/routine/today-cards";
import type { WatchView } from "@/lib/wearables/context";
import { ConnectWatchCard } from "./ConnectWatchCard";
import { ContinuePrograms } from "./ContinuePrograms";
import { SyncingCard } from "./SyncingCard";
import { buildWatchToday, type WatchTodayParts } from "./WatchToday";

type Props = {
  view: WatchView;
  evolution: EvolutionSummary;
  /** App das lojas com relógio simulado: sem os cards do relógio (só a Evolução). */
  hideWatch?: boolean;
  /** "Você vs Hero" na Evolução (não no "Exemplo", que não é o relógio da pessoa). */
  compare?: boolean;
};

// Hoje em 3 cards, na ordem pedida: Seu dia, Sua noite e Evolução. Cada card abre telas em tela
// cheia (visualizador compartilhado com a página do programa). Linha de fonte/sincronização acima dos
// cards; avisos de demonstração, bem-estar e "Sobre seus dados" seguem visíveis abaixo deles.
export async function TodayHub({ view, evolution, hideWatch = false, compare = true }: Props) {
  const [t, tp, tsync] = await Promise.all([getTranslations("me.today"), getTranslations("me.profile.evolution"), getTranslations("me.today.syncing")]);
  const watchState: WatchCardsState = hideWatch ? "hidden" : view.kind === "connect" ? "connect" : view.kind === "syncing" ? "syncing" : "metrics";
  const parts: WatchTodayParts | null =
    watchState === "metrics" && (view.kind === "demo" || view.kind === "example" || view.kind === "real")
      ? await buildWatchToday(view.kind === "real" ? { snapshot: view.snapshot, mode: "real", lastSync: view.lastSync, stale: view.stale } : { snapshot: view.snapshot, mode: view.kind })
      : null;
  const comparison = compare ? await heroComparisonScreen(view.kind === "demo" || view.kind === "real" ? view.snapshot : null) : null;

  // ---------------------------------------------------------------- Seu dia / Sua noite
  const watchScreen = (title: string): Screen[] => {
    if (watchState === "connect" && view.kind === "connect") return [{ id: "conectar", title, body: <ConnectWatchCard providers={view.providers} /> }];
    if (watchState === "syncing" && view.kind === "syncing") return [{ id: "sincronizando", title, body: <SyncingCard provider={view.provider} deviceName={view.deviceName} /> }];
    return [];
  };
  const placeholder = (id: string, title: string, text: string): Screen => ({ id, title, body: <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{text}</p> });

  const dayScreens: Screen[] = parts
    ? parts.day.length > 0
      ? parts.day.map((m) => ({ id: m.key, title: m.title, body: m.body }))
      : [placeholder("sem-dados", t("day.title"), parts.dayNoData ?? t("day.noData"))]
    : watchScreen(t("day.title"));
  const nightScreens: Screen[] = parts
    ? parts.night.length > 0
      ? parts.night.map((m) => ({ id: m.key, title: m.title, body: m.body }))
      : [placeholder("sem-dados", t("night.title"), t("hub.nightEmpty"))]
    : watchScreen(t("night.title"));
  const watchTeaser = (kind: "day" | "night") =>
    parts ? (kind === "day" ? parts.dayTeaser : parts.nightTeaser) || (kind === "day" ? t("day.noData") : t("hub.nightEmpty")) : watchState === "syncing" ? tsync("title") : t(kind === "day" ? "hub.connectDay" : "hub.connectNight");

  // ---------------------------------------------------------------- Evolução
  const programTotal = evolution.suggestions.length;
  const evolutionTeaser = joinTeaser(
    evolutionTeaserParts({ streak: evolution.currentStreak, programDone: 0, programTotal, completions: evolution.completionsCount }).map((part) => {
      if (part.kind === "streak") return t("hub.streak", { days: tp("streakDays", { n: part.days }) });
      if (part.kind === "programSteps") return t("hub.programSteps", { done: part.done, total: part.total });
      if (part.kind === "completions") return tp("completions", { n: part.n });
      return null;
    }),
  );
  const evolutionScreens: Screen[] = [
    {
      id: "resumo",
      title: tp("title"),
      body: (
        <div className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/60 to-surface p-5" data-testid="profile-evolution">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-sm">
              <Flame className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="type-overline text-accent-text">{tp("streakLabel")}</p>
              <p className="type-h2 type-numeric text-fg">{tp("streakDays", { n: evolution.currentStreak })}</p>
              <p className="type-caption text-fg-muted">{tp("completions", { n: evolution.completionsCount })}</p>
            </div>
          </div>
          <p className="type-body-sm text-fg-muted">{tp("description")}</p>
          <Button asChild variant="secondary" trailingIcon={<ChevronRight />} className="self-start">
            <Link href="/profile/evolution">{tp("open")}</Link>
          </Button>
        </div>
      ),
    },
    { id: "programas", title: t("programs.title"), body: <ContinuePrograms suggestions={evolution.suggestions} bare /> },
    ...(comparison ? [{ id: "comparacao", ...comparison }] : []),
  ];

  const all: Record<TodayCardKey, ScreenCard> = {
    dia: { key: "dia", title: t("hub.day"), teaser: watchTeaser("day"), icon: <Sun />, screens: dayScreens },
    noite: { key: "noite", title: t("hub.night"), teaser: watchTeaser("night"), icon: <Moon />, screens: nightScreens },
    evolucao: { key: "evolucao", title: tp("title"), teaser: evolutionTeaser, icon: <Flame />, screens: evolutionScreens },
  };
  const cards = todayCardKeys(watchState, { dia: dayScreens.length, noite: nightScreens.length, evolucao: evolutionScreens.length }).map((key) => all[key]);

  return (
    <div className="flex flex-col gap-4" data-testid="today-hub" data-watch={watchState}>
      {parts?.source}
      <ScreenCards cards={cards} testIdPrefix="today-hub" listClassName="lg:grid-cols-3" label={t("hub.label")} />
      {parts?.notes}
      {/* sem relógio: o "Conectar relógio" mora nas telas; o link de privacidade fica à vista */}
      {watchState === "connect" || watchState === "syncing" ? (
        <p className="type-caption text-fg-muted">
          <Link href="/profile/today/about" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("aboutLink")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </p>
      ) : null}
    </div>
  );
}
