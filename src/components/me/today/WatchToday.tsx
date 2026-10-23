import { ChevronRight, FlaskConical, Info, Watch } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, ProgressBar, ProgressRing } from "@/components/ui";
import { MODEL_INFO, NIGHT_VITALS_COMPONENTS } from "@/lib/wearables/catalog";
import type { WatchSnapshot } from "@/lib/wearables/demo";
import { formatClock, formatDistance, formatDuration, formatInteger, formatMetric, formatNoonClock, formatPace, formatPercent, formatDecimal } from "@/lib/wearables/format";
import { cn } from "@/lib/utils";
import { ymdToDate } from "../dates";
import { comparisonOf, indexCardKind, point, sectionAvailable, stressLevel, value } from "./watch-helpers";

type Props = {
  snapshot: WatchSnapshot;
  /** demo = conta de demonstração; example = prévia "Ver um exemplo"; real = relógio conectado (schema health). */
  mode: "demo" | "example" | "real";
  /** Só no modo real: última sincronização (no fuso do perfil) e se passou de 6 h (RN-11). */
  lastSync?: { date: string; at: number } | null;
  stale?: boolean;
  /** Nível dos títulos dos blocos ("Sua noite" / "Seu dia"); os cards ficam um nível abaixo. */
  blockHeading?: "h2" | "h3";
};

type Heading = "h3" | "h4";

// Hoje com relógio: dois blocos de ordem fixa ("Sua noite" e "Seu dia até agora · até HH:MM"),
// cerca de 5 cards em 1 coluna no celular. Cada valor leva o horário e a fonte; o que o modelo
// não mede fica escondido (nunca zero). Só leitura: nenhum campo de entrada, nenhum botão de adicionar.
export async function WatchToday({ snapshot, mode, blockHeading = "h3", lastSync = null, stale = false }: Props) {
  const [t, tw, locale] = await Promise.all([getTranslations("me.today"), getTranslations("wearables"), getLocale()]);
  const BlockHeading = blockHeading;
  const cardHeading: Heading = blockHeading === "h2" ? "h3" : "h4";
  const suffix = mode === "example" ? "?exemplo=1" : "";
  const href = (section: string) => `/profile/today/${section}${suffix}`;
  const info = MODEL_INFO[snapshot.model];
  // dado real não leva selo "Demo"/"Exemplo"; os textos de fonte não dizem "(simulado)"
  const real = mode === "real";
  const tag = real ? null : mode === "demo" ? t("demo.tag") : t("example.tag");
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
  const nightCards: ReactNode[] = [];
  const indexKind = indexCardKind(snapshot);
  if (indexKind === "body_battery") {
    const now = point(snapshot, "body_battery_now");
    const charged = value(snapshot, "body_battery_charged");
    const high = value(snapshot, "body_battery_high");
    const low = value(snapshot, "body_battery_low");
    nightCards.push(
      <TodayCard key="index" href={href("readiness")} title={t("cards.bodyBattery.title")} tag={tag} heading={cardHeading} source={pointSource(now!)} testId="today-card-readiness" detailLabel={t("openDetail")}>
        <p className="type-h2 type-numeric text-fg">{t("cards.bodyBattery.value", { value: now!.value, time: clock(now!.at) })}</p>
        {charged !== null ? <p className="type-body-sm text-fg">{t("cards.bodyBattery.charged", { n: charged })}</p> : null}
        {high !== null && low !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.bodyBattery.range", { high, low })}</p> : null}
        <p className="type-caption text-fg-muted">{t("cards.garminNote")}</p>
      </TodayCard>,
    );
  } else if (indexKind === "readiness_vendor") {
    const p = point(snapshot, "readiness_vendor")!;
    // nome, escala e rótulo ORIGINAIS da marca (Readiness, Recovery, Nightly Recharge), nunca 0–100 nosso
    const brandName = info.brand === "oura" || info.brand === "whoop" || info.brand === "polar" ? t(`cards.vendorReadiness.names.${info.brand}`) : t("cards.vendorReadiness.title");
    const scaleKey = p.scale === "oura_readiness" || p.scale === "whoop_recovery_pct" || p.scale === "polar_nightly_recharge_status" ? p.scale : null;
    const labelKey = p.label && ["very_poor", "poor", "compromised", "ok", "good", "very_good"].includes(p.label) ? p.label : null;
    nightCards.push(
      <TodayCard key="index" href={href("readiness")} title={brandName} tag={tag} heading={cardHeading} source={sourceAt(p.at)} testId="today-card-readiness" detailLabel={t("openDetail")}>
        <p className="type-h2 type-numeric text-fg">{labelKey ? t(`cards.vendorReadiness.polar.${labelKey}`) : `${formatInteger(p.value, locale)}${scaleKey === "whoop_recovery_pct" ? "%" : ""}`}</p>
        {scaleKey ? <p className="type-caption text-fg-muted">{t(`cards.vendorReadiness.scale.${scaleKey}`, { value: formatInteger(p.value, locale) })}</p> : null}
      </TodayCard>,
    );
  } else if (indexKind === "disposition" && snapshot.disposition) {
    nightCards.push(
      <TodayCard key="index" href={href("readiness")} title={t("cards.disposition.title")} tag={tag} heading={cardHeading} source={nightSource} testId="today-card-readiness" detailLabel={t("openDetail")}>
        <p className="type-h3 text-fg">{t(`cards.disposition.${snapshot.disposition.band}`)}</p>
        <p className="type-caption text-fg-muted">{t("cards.disposition.basis")}</p>
        <p className="type-caption text-fg-muted">{t("computedByUs")}</p>
        {info.hiddenIndexNote === "apple_readiness" ? <p className="type-caption text-fg-muted">{t("cards.appleNote")}</p> : null}
      </TodayCard>,
    );
  }

  const asleep = value(snapshot, "sleep_asleep_min");
  if (asleep !== null) {
    const start = value(snapshot, "sleep_start_local");
    const end = value(snapshot, "sleep_end_local");
    const score = value(snapshot, "sleep_score_vendor");
    const stages = ["sleep_deep_min", "sleep_rem_min", "sleep_light_min", "sleep_awake_min"] as const;
    const hasStages = stages.every((code) => value(snapshot, code) !== null);
    nightCards.push(
      <TodayCard key="sleep" href={href("sleep")} title={t("cards.sleep.title")} tag={tag} heading={cardHeading} source={nightSource} testId="today-card-sleep" detailLabel={t("openDetail")}>
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
      </TodayCard>,
    );
  }

  const vitals = snapshot.nightVitals;
  if (vitals && vitals.components.length > 0) {
    nightCards.push(
      <TodayCard key="vitals" href={href("vitals")} title={t("cards.vitals.title")} tag={tag} heading={cardHeading} source={nightSource} testId="today-card-vitals" detailLabel={t("openDetail")}>
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
      </TodayCard>,
    );
  }

  // ---------------------------------------------------------------- Seu dia até agora
  const dayCards: ReactNode[] = [];
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

  if (nightToday) {
    if (info.brand === "apple" && value(snapshot, "move_goal_kcal") !== null) {
      const rings = [
        { key: "move", v: value(snapshot, "active_kcal") ?? 0, goal: value(snapshot, "move_goal_kcal") ?? 1, fmt: (n: number) => `${formatInteger(n, locale)} kcal`, tone: "danger" as const },
        { key: "exercise", v: value(snapshot, "exercise_min") ?? 0, goal: value(snapshot, "exercise_goal_min") ?? 1, fmt: (n: number) => `${formatInteger(n, locale)} min`, tone: "success" as const },
        { key: "stand", v: value(snapshot, "stand_hours") ?? 0, goal: value(snapshot, "stand_goal_h") ?? 1, fmt: (n: number) => `${formatInteger(n, locale)} h`, tone: "info" as const },
      ];
      dayCards.push(
        <TodayCard key="activity" href={href("activity")} title={t("cards.activity.title")} tag={tag} heading={cardHeading} source={sourceAt(snapshot.syncedAt)} testId="today-card-activity" detailLabel={t("openDetail")}>
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
        </TodayCard>,
      );
    } else if (steps !== null) {
      const goal = value(snapshot, "steps_goal");
      const week = value(snapshot, "intensity_min_week");
      const weekGoal = value(snapshot, "intensity_goal_week_min");
      const floors = value(snapshot, "floors_climbed");
      const weighted = value(snapshot, "intensity_min_weighted");
      const distance = value(snapshot, "distance_m");
      const kcal = value(snapshot, "active_kcal");
      dayCards.push(
        <TodayCard key="activity" href={href("activity")} title={t("cards.activity.title")} tag={tag} heading={cardHeading} source={sourceAt(snapshot.syncedAt)} testId="today-card-activity" detailLabel={t("openDetail")}>
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
        </TodayCard>,
      );
    }

    // Treinos: com treino hoje, o card completo; sem treino, um card compacto que ainda leva ao
    // detalhe (VO₂máx, idade fitness, zonas, cargas de 7/28 dias), que é o caminho em dias de descanso.
    if (workouts.length === 0 && sectionAvailable(snapshot, "workouts")) {
      const vo2 = point(snapshot, "vo2max");
      dayCards.push(
        <TodayCard key="workouts" href={href("workouts")} title={t("cards.workouts.title")} tag={tag} heading={cardHeading} source={sourceAt(snapshot.syncedAt)} testId="today-card-workouts" detailLabel={t("openDetail")}>
          <p className="type-body-sm text-fg">{t("cards.workouts.none")}</p>
          {vo2 ? <p className="type-caption type-numeric text-fg">{t("cards.workouts.vo2", { value: formatMetric("vo2max", vo2.value, locale), date: shortDate(vo2.date) })}</p> : null}
          {loadLine ? <p className="type-caption text-fg-muted">{loadLine}</p> : null}
          {loadNote ? <p className="type-caption text-fg-muted">{loadNote}</p> : null}
        </TodayCard>,
      );
    } else if (workouts.length > 0) {
      dayCards.push(
        <TodayCard key="workouts" href={href("workouts")} title={t("cards.workouts.title")} tag={tag} heading={cardHeading} source={sourceAt(workouts[workouts.length - 1].endMin)} testId="today-card-workouts" detailLabel={t("openDetail")}>
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
        </TodayCard>,
      );
    }

    const stressAvg = value(snapshot, "stress_avg");
    const stressHigh = value(snapshot, "stress_high_min");
    if (stressAvg !== null || stressHigh !== null) {
      dayCards.push(
        <TodayCard key="stress" href={href("stress")} title={t("cards.stress.title")} tag={tag} heading={cardHeading} source={sourceAt(snapshot.syncedAt)} testId="today-card-stress" detailLabel={t("openDetail")}>
          {stressAvg !== null ? <p className="type-h3 type-numeric text-fg">{t("cards.stress.avg", { value: stressAvg, level: t(`cards.stress.levels.${stressLevel(stressAvg)}`) })}</p> : null}
          {stressHigh !== null ? <p className="type-caption type-numeric text-fg-muted">{t("cards.stress.high", { value: formatDuration(stressHigh, locale) })}</p> : null}
        </TodayCard>,
      );
    }

    const falls = value(snapshot, "falls_detected");
    if (falls !== null && falls > 0) {
      dayCards.push(
        <div key="safety" role="note" className="rounded-2xl border border-warning/40 bg-warning-soft p-4 type-body-sm text-fg" data-testid="today-card-safety">
          {t("cards.safety.fall", { time: clock(point(snapshot, "falls_detected")!.at) })}
        </div>,
      );
    }
  }

  // Ambiente: uma linha dentro de "Seu dia", só quando há valor (Apple).
  const noise = value(snapshot, "env_noise_db_avg");
  const daylight = value(snapshot, "daylight_min");
  const environment =
    nightToday && (noise !== null || daylight !== null)
      ? [noise !== null ? t("cards.environment.noise", { value: formatMetric("env_noise_db_avg", noise, locale) }) : null, daylight !== null ? t("cards.environment.daylight", { value: formatDuration(daylight, locale) }) : null].filter(Boolean).join(" · ")
      : null;

  return (
    <div className="flex flex-col gap-4" data-testid="watch-today" data-model={snapshot.model} data-mode={mode}>
      {real ? null : <WatchDemoLabel mode={mode} device={device} />}

      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 type-body-sm font-semibold text-fg" data-testid="watch-source">
          <Watch className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
          {real && lastSync && lastSync.date !== snapshot.date
            ? t("real.sourceOn", { device, date: shortDate(lastSync.date), time: clock(lastSync.at) })
            : t(tx("source"), { device, time: syncTime })}
        </p>
        <p className="type-caption text-fg-muted">{t(real ? "real.syncHint" : "syncHint", { app: tw(`syncApps.${info.syncApp}`) })}</p>
        {/* > 6 h sem sincronizar: selo com o horário e a dica da fonte (RN-11) */}
        {real && stale && lastSync ? (
          <p role="status" className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-caption text-fg" data-testid="watch-stale">
            {t("real.stale", { date: shortDate(lastSync.date), time: clock(lastSync.at), app: tw(`syncApps.${info.syncApp}`) })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="today-night-title" className="flex flex-col gap-3" data-testid="today-night">
          <BlockHeading id="today-night-title" className="type-overline text-accent-text">
            {t("night.title")}
          </BlockHeading>
          {snapshot.night && !nightToday ? <p className="type-caption text-fg-muted">{t("night.lastNight", { date: nightDateLabel })}</p> : null}
          {nightCards}
        </section>

        <section aria-labelledby="today-day-title" className="flex flex-col gap-3" data-testid="today-day">
          <BlockHeading id="today-day-title" className="flex flex-wrap items-center gap-2 type-overline text-accent-text">
            {t("day.title")}
            <Badge variant="neutral" size="sm" className="normal-case">
              {t("day.until", { time: syncTime })}
            </Badge>
          </BlockHeading>
          {nightToday ? null : <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("day.noData")}</p>}
          {dayCards}
          {environment ? (
            <Link
              href={href("environment")}
              prefetch={false}
              className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2 type-body-sm text-fg hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              data-testid="today-environment"
            >
              <span>
                <span className="font-semibold">{t("cards.environment.title")}:</span> {environment}
                {tag ? <span className="sr-only"> · {tag}</span> : null}
              </span>
              <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            </Link>
          ) : null}
        </section>
      </div>

      <footer className="flex flex-col gap-2 rounded-xl bg-surface-elevated p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 type-caption text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("wellness")}
        </p>
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
}

function TodayCard({
  href,
  title,
  tag,
  heading: Heading,
  source,
  testId,
  detailLabel,
  children,
}: {
  href: string;
  title: string;
  tag: string | null;
  heading: Heading;
  source: string;
  testId: string;
  detailLabel: string;
  children: ReactNode;
}) {
  return (
    // sem prefetch: cada detalhe passa pela sessão (Auth) e o Hoje tem vários cards na tela
    <Link
      href={href}
      prefetch={false}
      data-testid={testId}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition-[border-color,box-shadow]",
        "hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <Heading className="type-body font-semibold text-fg">{title}</Heading>
        {tag ? (
          <Badge variant="demo" size="sm">
            {tag}
          </Badge>
        ) : null}
      </span>
      {children}
      <span className="flex items-center justify-between gap-2 pt-1">
        <span className="type-caption type-numeric text-fg-muted">{source}</span>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-accent-text group-hover:underline">
          {detailLabel}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

/** Rótulo fixo e bem visível: dados simulados, não são de ninguém e não ficam guardados. */
export async function WatchDemoLabel({ mode, device }: { mode: "demo" | "example"; device: string }) {
  const t = await getTranslations("me.today");
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border border-dashed border-warning/60 bg-warning-soft p-4" data-testid="watch-demo-label">
      <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="type-h3 text-fg">{mode === "demo" ? t("demo.title") : t("example.title")}</p>
        <p className="type-body-sm text-fg">{mode === "demo" ? t("demo.body", { device }) : t("example.body", { device })}</p>
      </div>
    </div>
  );
}
