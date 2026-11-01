import { ChevronRight, FlaskConical, Info, Watch } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Button, ProgressBar, ProgressRing } from "@/components/ui";
import { dayTeaserParts, joinTeaser, nightTeaserParts, type TeaserPart } from "@/lib/routine/today-cards";
import { MODEL_INFO, NIGHT_VITALS_COMPONENTS } from "@/lib/wearables/catalog";
import type { WatchSnapshot } from "@/lib/wearables/demo";
import { formatClock, formatDistance, formatDuration, formatInteger, formatMetric, formatNoonClock, formatPace, formatPercent, formatDecimal } from "@/lib/wearables/format";
import { cn } from "@/lib/utils";
import { ymdToDate } from "../dates";
import { comparisonOf, indexCardKind, point, sectionAvailable, stressLevel, value } from "./watch-helpers";

type Props = {
  snapshot: WatchSnapshot;
  /** example = prévia "Ver um exemplo"; real = relógio conectado (schema health). */
  mode: "example" | "real";
  /** Só no modo real: última sincronização (no fuso do perfil) e se passou de 6 h (RN-11). */
  lastSync?: { date: string; at: number } | null;
  stale?: boolean;
};

/** Uma métrica do Hoje: vira uma tela do card "Seu dia" ou "Sua noite". */
export type TodayMetric = { key: string; title: string; body: ReactNode };

export type WatchTodayParts = {
  night: TodayMetric[];
  day: TodayMetric[];
  /** Linha compacta de fonte/sincronização (logo abaixo do cabeçalho). */
  source: ReactNode;
  /** Avisos que ficam visíveis na página, abaixo dos cards (demo, queda, bem-estar, Sobre seus dados). */
  notes: ReactNode;
  /** Sem dados de hoje ainda (antes da sincronização da manhã). */
  dayNoData: string | null;
  /** Resumos dos cards. */
  dayTeaser: string;
  nightTeaser: string;
};

// Hoje com relógio: as métricas de "Sua noite" e "Seu dia até agora" viram telas dos cards. Cada
// valor leva o horário e a fonte; o que o modelo não mede fica escondido (nunca zero). Só leitura:
// nenhum campo de entrada, nenhum botão de adicionar.
export async function buildWatchToday({ snapshot, mode, lastSync = null, stale = false }: Props): Promise<WatchTodayParts> {
  const [t, tw, locale] = await Promise.all([getTranslations("me.today"), getTranslations("wearables"), getLocale()]);
  const suffix = mode === "example" ? "?exemplo=1" : "";
  const href = (section: string) => `/profile/today/${section}${suffix}`;
  const info = MODEL_INFO[snapshot.model];
  // dado real não leva selo "Demo"/"Exemplo"; os textos de fonte não dizem "(simulado)"
  const real = mode === "real";
  const tag = real ? null : t("example.tag");
  const tx = (key: "source" | "sourceAt" | "sourceOn") => (real ? `real.${key}` : key);
  const device = snapshot.deviceName;
  const clock = (min: number) => formatClock(min, locale);
  const sourceAt = (min: number) => t(tx("sourceAt"), { device, time: clock(min) });
  const syncTime = clock(snapshot.syncedAt);
  const nightToday = snapshot.night?.isToday ?? false;
  const nightDateLabel = snapshot.night ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(ymdToDate(snapshot.night.date)) : "";
  const nightAt = snapshot.night ? snapshot.night.endClock : snapshot.syncedAt;
  const nightSource = snapshot.night && !nightToday ? t(tx("sourceOn"), { device, date: nightDateLabel, time: clock(nightAt) }) : sourceAt(nightAt);
  const comparisonText = (code: Parameters<typeof comparisonOf>[1]) => t(`comparison.${comparisonOf(snapshot, code)}`);
  const shortDate = (ymd: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(ymdToDate(ymd));
  // valor de outro dia (ex.: Body Battery de ontem antes da sincronização da manhã) leva a data dele
  const pointSource = (p: { date: string; at: number }) => (p.date === snapshot.date ? sourceAt(p.at) : t(tx("sourceOn"), { device, date: shortDate(p.date), time: clock(p.at) }));

  // ---------------------------------------------------------------- Sua noite
  const nightCards: TodayMetric[] = [];
  const indexKind = indexCardKind(snapshot);
  if (indexKind === "body_battery") {
    const now = point(snapshot, "body_battery_now");
    const charged = value(snapshot, "body_battery_charged");
    const high = value(snapshot, "body_battery_high");
    const low = value(snapshot, "body_battery_low");
    nightCards.push({
      key: "readiness",
      title: t("cards.bodyBattery.title"),
      body: (
      <TodayCard href={href("readiness")} title={t("cards.bodyBattery.title")} tag={tag} source={pointSource(now!)} testId="today-card-readiness" detailLabel={t("openDetail")}>
        <p className="type-h2 type-numeric text-fg">{t("cards.bodyBattery.value", { value: now!.value, time: clock(now!.at) })}</p>
        {charged !== null ? <p className="type-body-sm text-fg">{t("cards.bodyBattery.charged", { n: charged })}</p> : null}
        {high !== null && low !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.bodyBattery.range", { high, low })}</p> : null}
        <p className="type-caption text-fg-muted">{t("cards.garminNote")}</p>
      </TodayCard>
    ),
    });
  } else if (indexKind === "readiness_vendor") {
    const p = point(snapshot, "readiness_vendor")!;
    // nome, escala e rótulo ORIGINAIS da marca (Readiness, Recovery, Nightly Recharge), nunca 0–100 nosso
    const brandName = info.brand === "oura" || info.brand === "whoop" || info.brand === "polar" ? t(`cards.vendorReadiness.names.${info.brand}`) : t("cards.vendorReadiness.title");
    const scaleKey = p.scale === "oura_readiness" || p.scale === "whoop_recovery_pct" || p.scale === "polar_nightly_recharge_status" ? p.scale : null;
    const labelKey = p.label && ["very_poor", "poor", "compromised", "ok", "good", "very_good"].includes(p.label) ? p.label : null;
    nightCards.push({
      key: "readiness",
      title: brandName,
      body: (
      <TodayCard href={href("readiness")} title={brandName} tag={tag} source={sourceAt(p.at)} testId="today-card-readiness" detailLabel={t("openDetail")}>
        <p className="type-h2 type-numeric text-fg">{labelKey ? t(`cards.vendorReadiness.polar.${labelKey}`) : `${formatInteger(p.value, locale)}${scaleKey === "whoop_recovery_pct" ? "%" : ""}`}</p>
        {scaleKey ? <p className="type-caption text-fg-muted">{t(`cards.vendorReadiness.scale.${scaleKey}`, { value: formatInteger(p.value, locale) })}</p> : null}
      </TodayCard>
    ),
    });
  } else if (indexKind === "disposition" && snapshot.disposition) {
    nightCards.push({
      key: "readiness",
      title: t("cards.disposition.title"),
      body: (
      <TodayCard href={href("readiness")} title={t("cards.disposition.title")} tag={tag} source={nightSource} testId="today-card-readiness" detailLabel={t("openDetail")}>
        <p className="type-h3 text-fg">{t(`cards.disposition.${snapshot.disposition.band}`)}</p>
        <p className="type-caption text-fg-muted">{t("cards.disposition.basis")}</p>
        <p className="type-caption text-fg-muted">{t("computedByUs")}</p>
        {info.hiddenIndexNote === "apple_readiness" ? <p className="type-caption text-fg-muted">{t("cards.appleNote")}</p> : null}
      </TodayCard>
    ),
    });
  }

  const asleep = value(snapshot, "sleep_asleep_min");
  if (asleep !== null) {
    const start = value(snapshot, "sleep_start_local");
    const end = value(snapshot, "sleep_end_local");
    const score = value(snapshot, "sleep_score_vendor");
    const stages = ["sleep_deep_min", "sleep_rem_min", "sleep_light_min", "sleep_awake_min"] as const;
    const hasStages = stages.every((code) => value(snapshot, code) !== null);
    nightCards.push({
      key: "sleep",
      title: t("cards.sleep.title"),
      body: (
      <TodayCard href={href("sleep")} title={t("cards.sleep.title")} tag={tag} source={nightSource} testId="today-card-sleep" detailLabel={t("openDetail")}>
        <p className="type-h2 type-numeric text-fg">
          {formatDuration(asleep, locale)}
          {/* separador real (não só margem) para o leitor de tela não colar "min" e "nota" */}
          {score !== null ? <span className="type-body-sm font-semibold text-fg-muted">{" · "}{t("cards.sleep.vendorScore", { brand: tw(`brands.${info.brand}`), score })}</span> : null}
        </p>
        {start !== null && end !== null ? <p className="type-body-sm type-numeric text-fg">{t("cards.sleep.window", { start: formatNoonClock(start, locale), end: formatNoonClock(end, locale) })}</p> : null}
        <p className="type-caption text-fg-muted">{comparisonText("sleep_asleep_min")}</p>
        {hasStages ? (
          <p className="type-caption type-numeric text-fg-muted">
            {t("cards.sleep.stages", {
              deep: formatDuration(value(snapshot, "sleep_deep_min")!, locale),
              rem: formatDuration(value(snapshot, "sleep_rem_min")!, locale),
              light: formatDuration(value(snapshot, "sleep_light_min")!, locale),
              awake: formatDuration(value(snapshot, "sleep_awake_min")!, locale),
            })}
          </p>
        ) : null}
      </TodayCard>
    ),
    });
  }

  const vitals = snapshot.nightVitals;
  if (vitals && vitals.components.length > 0) {
    nightCards.push({
      key: "vitals",
      title: t("cards.vitals.title"),
      body: (
      <TodayCard href={href("vitals")} title={t("cards.vitals.title")} tag={tag} source={nightSource} testId="today-card-vitals" detailLabel={t("openDetail")}>
        <p className="type-h3 text-fg">{vitals.total > 0 ? t("cards.vitals.summary", { within: vitals.within, total: vitals.total }) : t("cards.vitals.learning")}</p>
        <ul className="flex flex-col gap-0.5">
          {NIGHT_VITALS_COMPONENTS.map((code) => {
            const c = vitals.components.find((x) => x.code === code);
            if (!c) return null;
            return (
              <li key={code} className="type-caption type-numeric text-fg">
                {t("cards.vitals.item", { name: t(`cards.vitals.short.${code}`), value: formatMetric(code, c.value, locale), comparison: t(`cards.vitals.compShort.${c.comparison}`) })}
              </li>
            );
          })}
        </ul>
        <p className="type-caption text-fg-muted">{t("computedByUs")}</p>
      </TodayCard>
    ),
    });
  }

  // ---------------------------------------------------------------- Seu dia até agora
  const dayCards: TodayMetric[] = [];
  const workouts = snapshot.workouts;
  const load = point(snapshot, "cardio_load_day_uh");
  // dia real parcial sem curva intradiária: sem comparação (não dá para cortar os dias anteriores no mesmo horário)
  const loadLine = load
    ? real && !snapshot.baselines.cardio_load_day_uh
      ? t("cards.workouts.loadNoComparison", { value: formatInteger(load.value, locale) })
      : t("cards.workouts.load", { value: formatInteger(load.value, locale), comparison: comparisonText("cardio_load_day_uh") })
    : null;
  // relógio real sem zonas da marca: a carga sai das zonas estimadas pela FC média (§13.4), e diz isso
  const loadNote = load && real && snapshot.estimatedZones ? t("cards.workouts.loadEstimated") : null;
  const steps = value(snapshot, "steps");

  let fallTime: string | null = null;
  if (nightToday) {
    if (info.brand === "apple" && value(snapshot, "move_goal_kcal") !== null) {
      const rings = [
        { key: "move", v: value(snapshot, "active_kcal") ?? 0, goal: value(snapshot, "move_goal_kcal") ?? 1, fmt: (n: number) => `${formatInteger(n, locale)} kcal`, tone: "danger" as const },
        { key: "exercise", v: value(snapshot, "exercise_min") ?? 0, goal: value(snapshot, "exercise_goal_min") ?? 1, fmt: (n: number) => `${formatInteger(n, locale)} min`, tone: "success" as const },
        { key: "stand", v: value(snapshot, "stand_hours") ?? 0, goal: value(snapshot, "stand_goal_h") ?? 1, fmt: (n: number) => `${formatInteger(n, locale)} h`, tone: "info" as const },
      ];
      dayCards.push({
        key: "activity",
        title: t("cards.activity.title"),
        body: (
        <TodayCard href={href("activity")} title={t("cards.activity.title")} tag={tag} source={sourceAt(snapshot.syncedAt)} testId="today-card-activity" detailLabel={t("openDetail")}>
          <div className="flex flex-wrap items-center gap-3" aria-label={t("cards.activity.rings")} role="group">
            {rings.map((r) => {
              const label = t("cards.activity.ring", { name: t(`cards.activity.${r.key}`), value: r.fmt(r.v), goal: r.fmt(r.goal), percent: formatPercent((r.v / r.goal) * 100, locale) });
              return <ProgressRing key={r.key} value={r.v} max={r.goal} label={label} tone={r.tone} size={56} strokeWidth={6} className="motion-reduce:[&_circle]:transition-none" />;
            })}
          </div>
          <ul className="flex flex-col gap-0.5">
            {rings.map((r) => (
              <li key={r.key} className="type-caption type-numeric text-fg">
                {t("cards.activity.ring", { name: t(`cards.activity.${r.key}`), value: r.fmt(r.v), goal: r.fmt(r.goal), percent: formatPercent((r.v / r.goal) * 100, locale) })}
              </li>
            ))}
          </ul>
          {steps !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.activity.steps", { steps: Math.round(steps) })}{value(snapshot, "distance_m") !== null ? ` · ${formatDistance(value(snapshot, "distance_m")!, locale)}` : ""}</p> : null}
        </TodayCard>
      ),
      });
    } else if (steps !== null) {
      const goal = value(snapshot, "steps_goal");
      const week = value(snapshot, "intensity_min_week");
      const weekGoal = value(snapshot, "intensity_goal_week_min");
      const floors = value(snapshot, "floors_climbed");
      const weighted = value(snapshot, "intensity_min_weighted");
      const distance = value(snapshot, "distance_m");
      const kcal = value(snapshot, "active_kcal");
      dayCards.push({
        key: "activity",
        title: t("cards.activity.title"),
        body: (
        <TodayCard href={href("activity")} title={t("cards.activity.title")} tag={tag} source={sourceAt(snapshot.syncedAt)} testId="today-card-activity" detailLabel={t("openDetail")}>
          <p className="type-h2 type-numeric text-fg">{t("cards.activity.steps", { steps: Math.round(steps) })}</p>
          {goal !== null ? (
            <>
              <p className="type-caption type-numeric text-fg-muted">{t("cards.activity.stepsGoal", { percent: formatPercent((steps / goal) * 100, locale), goal: formatInteger(goal, locale) })}</p>
              <ProgressBar value={steps} max={goal} label={t("cards.activity.stepsGoal", { percent: formatPercent((steps / goal) * 100, locale), goal: formatInteger(goal, locale) })} size="sm" />
            </>
          ) : null}
          {week !== null && weekGoal !== null ? <p className="type-caption type-numeric text-fg">{t("cards.activity.intensityWeek", { value: formatInteger(week, locale), goal: formatInteger(weekGoal, locale) })}</p> : null}
          {floors !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.activity.floors", { n: floors })}</p> : null}
          {weighted !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.activity.intensityCalc", { value: formatInteger(weighted, locale) })}</p> : null}
          {distance !== null && kcal !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.activity.distanceKcal", { distance: formatDistance(distance, locale), kcal: `${formatInteger(kcal, locale)} kcal` })}</p> : null}
        </TodayCard>
      ),
      });
    }

    // Treinos: com treino hoje, o card completo; sem treino, um card compacto que ainda leva ao
    // detalhe (VO₂máx, idade fitness, zonas, cargas de 7/28 dias), que é o caminho em dias de descanso.
    if (workouts.length === 0 && sectionAvailable(snapshot, "workouts")) {
      const vo2 = point(snapshot, "vo2max");
      dayCards.push({
        key: "workouts",
        title: t("cards.workouts.title"),
        body: (
        <TodayCard href={href("workouts")} title={t("cards.workouts.title")} tag={tag} source={sourceAt(snapshot.syncedAt)} testId="today-card-workouts" detailLabel={t("openDetail")}>
          <p className="type-body-sm text-fg">{t("cards.workouts.none")}</p>
          {vo2 ? <p className="type-caption type-numeric text-fg">{t("cards.workouts.vo2", { value: formatMetric("vo2max", vo2.value, locale), date: shortDate(vo2.date) })}</p> : null}
          {loadLine ? <p className="type-caption text-fg-muted">{loadLine}</p> : null}
          {loadNote ? <p className="type-caption text-fg-muted">{loadNote}</p> : null}
        </TodayCard>
      ),
      });
    } else if (workouts.length > 0) {
      dayCards.push({
        key: "workouts",
        title: t("cards.workouts.title"),
        body: (
        <TodayCard href={href("workouts")} title={t("cards.workouts.title")} tag={tag} source={sourceAt(workouts[workouts.length - 1].endMin)} testId="today-card-workouts" detailLabel={t("openDetail")}>
          {workouts.map((w, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="type-h3 type-numeric text-fg">{t("cards.workouts.session", { sport: t(`cards.workouts.sports.${w.sport}`), duration: formatDuration(w.durationMin, locale) })}</p>
              {w.distanceM ? (
                <p className="type-body-sm type-numeric text-fg">
                  {formatDistance(w.distanceM, locale)} ·{" "}
                  {w.sport === "cycle" ? t("cards.workouts.speed", { value: formatDecimal(w.distanceM / 1000 / (w.durationMin / 60), locale) }) : formatPace((w.durationMin * 60) / (w.distanceM / 1000))}
                </p>
              ) : null}
              {/* treino sem FC (fonte não mandou): a linha não aparece, nada vira zero */}
              {w.avgHr > 0 && w.maxHr > 0 ? <p className="type-caption type-numeric text-fg-muted">{t("cards.workouts.hr", { avg: w.avgHr, max: w.maxHr })}</p> : null}
            </div>
          ))}
          {loadLine ? <p className="type-caption text-fg-muted">{loadLine}</p> : null}
          {loadNote ? <p className="type-caption text-fg-muted">{loadNote}</p> : null}
        </TodayCard>
      ),
      });
    }

    const stressAvg = value(snapshot, "stress_avg");
    const stressHigh = value(snapshot, "stress_high_min");
    if (stressAvg !== null || stressHigh !== null) {
      dayCards.push({
        key: "stress",
        title: t("cards.stress.title"),
        body: (
        <TodayCard href={href("stress")} title={t("cards.stress.title")} tag={tag} source={sourceAt(snapshot.syncedAt)} testId="today-card-stress" detailLabel={t("openDetail")}>
          {stressAvg !== null ? <p className="type-h3 type-numeric text-fg">{t("cards.stress.avg", { value: stressAvg, level: t(`cards.stress.levels.${stressLevel(stressAvg)}`) })}</p> : null}
          {stressHigh !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.stress.high", { value: formatDuration(stressHigh, locale) })}</p> : null}
        </TodayCard>
      ),
      });
    }

    const falls = value(snapshot, "falls_detected");
    if (falls !== null && falls > 0) fallTime = clock(point(snapshot, "falls_detected")!.at);
  }

  // Ambiente: uma tela de "Seu dia", só quando há valor (Apple).
  const noise = value(snapshot, "env_noise_db_avg");
  const daylight = value(snapshot, "daylight_min");
  if (nightToday && (noise !== null || daylight !== null)) {
    dayCards.push({
      key: "environment",
      title: t("cards.environment.title"),
      body: (
        <TodayCard href={href("environment")} title={t("cards.environment.title")} tag={tag} source={sourceAt(snapshot.syncedAt)} testId="today-environment" detailLabel={t("openDetail")}>
          <ul className="flex flex-col gap-0.5">
            {noise !== null ? <li className="type-body-sm type-numeric text-fg">{t("cards.environment.noise", { value: formatMetric("env_noise_db_avg", noise, locale) })}</li> : null}
            {daylight !== null ? <li className="type-body-sm type-numeric text-fg">{t("cards.environment.daylight", { value: formatDuration(daylight, locale) })}</li> : null}
          </ul>
        </TodayCard>
      ),
    });
  }

  // noite de outro dia (antes da sincronização da manhã): o aviso vai no topo de cada tela da noite
  const lastNight = snapshot.night && !nightToday ? t("night.lastNight", { date: nightDateLabel }) : null;
  const night = lastNight
    ? nightCards.map((m) => ({
        ...m,
        body: (
          <>
            <p className="type-caption text-fg-muted">{lastNight}</p>
            {m.body}
          </>
        ),
      }))
    : nightCards;

  // ---------------------------------------------------------------- resumos dos cards
  const bodyBatteryNow = indexKind === "body_battery" ? value(snapshot, "body_battery_now") : null;
  const dayTeaser = nightToday
    ? joinTeaser(
        dayTeaserParts({ steps, load: load?.value ?? null, workouts: workouts.length, stressAvg: value(snapshot, "stress_avg") }).map((part) =>
          teaserText(part),
        ),
      )
    : t("day.noData");
  const nightTeaser = joinTeaser(
    nightTeaserParts({
      asleepMin: asleep,
      bodyBattery: bodyBatteryNow,
      readiness: indexKind === "readiness_vendor" ? value(snapshot, "readiness_vendor") : null,
      disposition: indexKind === "disposition" && snapshot.disposition ? snapshot.disposition.band : null,
    }).map((part) => teaserText(part)),
  );
  function teaserText(part: TeaserPart): string {
    switch (part.kind) {
      case "steps":
        return t("cards.activity.steps", { steps: part.value });
      case "load":
        return t("hub.load", { value: formatInteger(part.value, locale) });
      case "workouts":
        return t("hub.workouts", { n: part.n });
      case "stress":
        return t("hub.stress", { value: part.value });
      case "sleep":
        return formatDuration(part.minutes, locale);
      case "bodyBattery":
        return t("hub.bodyBattery", { value: part.value });
      case "readiness":
        return t("hub.readiness", { value: formatInteger(part.value, locale) });
      case "disposition":
        return t(`cards.disposition.${part.band as "below" | "within" | "above"}`);
      default:
        return "";
    }
  }

  const source = (
    <div className="flex flex-col gap-1" data-testid="watch-today" data-model={snapshot.model} data-mode={mode}>
      <p className="flex items-start gap-1.5 type-body-sm font-semibold text-fg" data-testid="watch-source">
        <Watch className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <span>
          {real && lastSync && lastSync.date !== snapshot.date ? t("real.sourceOn", { device, date: shortDate(lastSync.date), time: clock(lastSync.at) }) : t(tx("source"), { device, time: syncTime })}
          {tag ? (
            <>
              {" "}
              <Badge variant="demo" size="sm" className="align-middle">
                {tag}
              </Badge>
            </>
          ) : null}
        </span>
      </p>
      {/* > 6 h sem sincronizar: selo com o horário e a dica da fonte (RN-11) */}
      {real && stale && lastSync ? (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-caption text-fg" data-testid="watch-stale">
          {t("real.stale", { date: shortDate(lastSync.date), time: clock(lastSync.at), app: tw(`syncApps.${info.syncApp}`) })}
        </p>
      ) : null}
    </div>
  );

  const notes = (
    <div className="flex flex-col gap-3" data-testid="today-notes">
      {/* possível queda: aviso de segurança fica à vista na página, não dentro de uma tela */}
      {fallTime ? (
        <div role="note" className="rounded-2xl border border-warning/40 bg-warning-soft p-4 type-body-sm text-fg" data-testid="today-card-safety">
          {t("cards.safety.fall", { time: fallTime })}
        </div>
      ) : null}
      {real ? null : <WatchDemoLabel mode={mode} device={device} compact />}
      <footer className="flex flex-col gap-2 rounded-xl bg-surface-elevated p-4">
        <p className="flex items-start gap-2 type-caption text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("wellness")}
        </p>
        <p className="type-caption text-fg-muted">{t(real ? "real.syncHint" : "syncHint", { app: tw(`syncApps.${info.syncApp}`) })}</p>
        <span className="flex flex-wrap gap-x-4">
          <Link href={`/profile/today/about${suffix}`} prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("aboutLink")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
          {real ? (
            <Link href="/profile/devices" prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {t("real.devicesLink")}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </span>
      </footer>
    </div>
  );

  return { night, day: dayCards, source, notes, dayNoData: nightToday ? null : t("day.noData"), dayTeaser, nightTeaser };
}

/** Corpo de uma tela de métrica: os valores, a fonte com horário e "Ver detalhes" (título fica na tela). */
function TodayCard({
  href,
  title,
  tag,
  source,
  testId,
  detailLabel,
  children,
}: {
  href: string;
  title: string;
  tag: string | null;
  source: string;
  testId: string;
  detailLabel: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      {tag ? (
        <Badge variant="demo" size="sm" className="self-start">
          {tag}
        </Badge>
      ) : null}
      {children}
      <p className="type-caption type-numeric text-fg-muted">{source}</p>
      {/* sem prefetch: cada detalhe passa pela sessão (Auth) */}
      <Button asChild variant="secondary" trailingIcon={<ChevronRight />} className="self-start">
        <Link href={href} prefetch={false} data-testid={`${testId}-detail`}>
          {detailLabel}
          <span className="sr-only">: {title}</span>
        </Link>
      </Button>
    </div>
  );
}

/** Rótulo fixo e bem visível: dados simulados, não são de ninguém e não ficam guardados. */
export async function WatchDemoLabel({ device, compact = false }: { mode: "example"; device: string; /** Versão menor (abaixo dos cards do Hoje). */ compact?: boolean }) {
  const t = await getTranslations("me.today");
  return (
    <div role="note" className={cn("flex items-start gap-3 rounded-2xl border border-dashed border-warning/60 bg-warning-soft", compact ? "px-4 py-3" : "p-4")} data-testid="watch-demo-label">
      <FlaskConical className={cn("mt-0.5 shrink-0 text-warning", compact ? "size-4" : "size-5")} aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className={compact ? "type-body-sm font-semibold text-fg" : "type-h3 text-fg"}>{t("example.title")}</p>
        <p className={compact ? "type-caption text-fg" : "type-body-sm text-fg"}>{t("example.body", { device })}</p>
      </div>
    </div>
  );
}
