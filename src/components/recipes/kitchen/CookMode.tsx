"use client";

import { ArrowLeft, ArrowRight, BellRing, Check, ChefHat, Circle, CircleCheck, Lightbulb, ListChecks, Sun, SunDim, Thermometer, Timer, TimerOff, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type TouchEvent } from "react";
import { completeContent } from "@/app/(app)/content/actions";
import { Badge, Button, IconButton, ProgressBar, Sheet, Switch, useToast } from "@/components/ui";
import {
  applyNav,
  COOK_SOUND_KEY,
  cookStorageKey,
  formatClock,
  keyToNav,
  parseCookProgress,
  serializeCookProgress,
  shouldAlarmOnRestore,
  startTimer,
  swipeToNav,
  timerDone,
  timerRemainingMs,
  toggleDone,
  type CookIngredient,
  type CookModel,
  type CookNav,
  type CookTimer,
} from "@/lib/recipes/cook-mode";
import { formatStepDuration } from "@/lib/recipes/view-model";
import { createWakeLock, type WakeLockController, type WakeLockStatus } from "@/lib/recipes/wake-lock";
import { cn } from "@/lib/utils";
import { createAlarm, type Alarm } from "./alarm";

type Props = {
  model: CookModel;
  /** Volta à receita completa (com o mesmo ajuste de porções). */
  recipeHref: string;
  /** Rótulo "Concluída em …" quando a pessoa já concluiu a receita. */
  completedLabel: string | null;
};

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // modo privado ou cota cheia: o Modo Cozinha segue funcionando sem guardar
  }
}

// Modo Cozinha: uma etapa por vez, letra grande, navegação por botão, teclado ou deslizar,
// ingredientes da etapa com as porções da URL, cronômetro por horário de término (continua certo
// com a tela bloqueada), etapas marcadas no aparelho por 24 h e a tela acesa quando o navegador deixa.
export function CookMode({ model, recipeHref, completedLabel }: Props) {
  const t = useTranslations("kitchen.cook");
  const tv = useTranslations("recipes.view");
  const { toast } = useToast();
  const steps = model.steps;
  const total = steps.length;
  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);
  const storageKey = cookStorageKey(model.contentId);

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [ringing, setRinging] = useState<string[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sound, setSound] = useState(true);
  const [keepAwake, setKeepAwake] = useState(true);
  const [wake, setWake] = useState<WakeLockStatus>("off");
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [alert, setAlert] = useState("");
  const [completed, setCompleted] = useState<string | null>(completedLabel);
  const [completing, startCompleting] = useTransition();

  const alarmRef = useRef<Alarm | null>(null);
  const wakeRef = useRef<WakeLockController | null>(null);
  const firedRef = useRef(new Set<string>());
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  // o alarme lê a escolha mais recente sem reagendar o efeito do relógio
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const step = steps[index];
  const numbers = useMemo(() => new Map(steps.map((s) => [s.id, s.number])), [steps]);
  const stepNumber = useCallback((stepId: string) => numbers.get(stepId) ?? 0, [numbers]);

  // ---------------------------------------------------------------- progresso guardado no aparelho
  useEffect(() => {
    const restoredAt = Date.now();
    const progress = parseCookProgress(readStorage(storageKey), restoredAt, stepIds);
    setIndex(progress.step);
    setDone(progress.done);
    setTimers(progress.timers);
    // o que terminou com a página fechada: toca só se foi há pouco; o resto fica "terminou", em silêncio
    const finished = progress.timers.filter((tm) => timerDone(tm, restoredAt));
    for (const tm of finished) {
      if (!shouldAlarmOnRestore(tm, restoredAt)) firedRef.current.add(`${tm.stepId}:${tm.endsAt}`);
    }
    setRinging(finished.map((tm) => tm.stepId));
    setSound(readStorage(COOK_SOUND_KEY) !== "off");
    setNow(restoredAt);
    setHydrated(true);
  }, [storageKey, stepIds]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(storageKey, serializeCookProgress({ step: index, done, timers }, Date.now()));
  }, [hydrated, storageKey, index, done, timers]);

  // ---------------------------------------------------------------- relógio e alarme
  const running = timers.some((tm) => now === null || !timerDone(tm, now));
  useEffect(() => {
    if (!hydrated || timers.length === 0) return;
    const tick = () => setNow(Date.now());
    // a contagem vem do horário de término: o intervalo só redesenha (pode atrasar em segundo plano)
    const interval = running ? window.setInterval(tick, 250) : undefined;
    // e um despertador exato para o próximo término
    const next = timers.map((tm) => tm.endsAt).filter((at) => at > Date.now()).sort((a, b) => a - b)[0];
    const timeout = next ? window.setTimeout(tick, next - Date.now() + 20) : undefined;
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (interval) window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [hydrated, timers, running]);

  useEffect(() => {
    if (now === null) return;
    const fresh = timers.filter((tm) => timerDone(tm, now) && !firedRef.current.has(`${tm.stepId}:${tm.endsAt}`));
    if (fresh.length === 0) return;
    for (const tm of fresh) firedRef.current.add(`${tm.stepId}:${tm.endsAt}`);
    alarmRef.current ??= createAlarm();
    alarmRef.current.ring({ sound: soundRef.current });
    setRinging((list) => [...new Set([...list, ...fresh.map((tm) => tm.stepId)])]);
    setAlert(t("timer.finishedAlert", { n: stepNumber(fresh[0].stepId) }));
  }, [now, timers, t, stepNumber]);

  useEffect(() => () => alarmRef.current?.dispose(), []);

  // ---------------------------------------------------------------- tela acesa
  useEffect(() => {
    const controller = createWakeLock(navigator as never, document, setWake);
    wakeRef.current = controller;
    setWake(controller.status());
    return () => controller.dispose();
  }, []);

  useEffect(() => {
    const controller = wakeRef.current;
    if (!controller) return;
    if (keepAwake) void controller.enable();
    else void controller.disable();
  }, [keepAwake]);

  // ---------------------------------------------------------------- navegação
  const go = useCallback((nav: CookNav) => setIndex((i) => applyNav(i, nav, total)), [total]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // com o painel de ingredientes ou um diálogo aberto, as setas são deles
      if (document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement | null;
      const nav = keyToNav({ key: event.key, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, targetTag: target?.tagName ?? null });
      if (!nav) return;
      event.preventDefault();
      go(nav);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const nav = swipeToNav(touch.clientX - start.x, touch.clientY - start.y);
    if (nav) go(nav);
  };

  // ---------------------------------------------------------------- ações da etapa
  const timer = step ? timers.find((tm) => tm.stepId === step.id) : undefined;

  function onStartTimer() {
    if (!step?.durationSeconds) return;
    alarmRef.current ??= createAlarm();
    alarmRef.current.prime();
    const started = startTimer(step.id, step.durationSeconds, Date.now());
    setTimers((list) => [...list.filter((tm) => tm.stepId !== step.id), started]);
    setRinging((list) => list.filter((id) => id !== step.id));
    setNow(Date.now());
    setAlert("");
  }

  function onCancelTimer(stepId: string) {
    setTimers((list) => list.filter((tm) => tm.stepId !== stepId));
    setRinging((list) => list.filter((id) => id !== stepId));
    setAlert("");
  }

  function onToggleSound() {
    const next = !sound;
    setSound(next);
    writeStorage(COOK_SOUND_KEY, next ? "on" : "off");
  }

  function onComplete() {
    startCompleting(async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const result = await completeContent({ contentId: model.contentId, timezone, path: `/content/${model.slug}` });
      if (!result.ok) {
        toast({ title: t("complete.error"), variant: "error" });
        return;
      }
      setCompleted(t("complete.done"));
      toast({ title: t("complete.done"), variant: "success" });
    });
  }

  const durationText = (seconds: number) => {
    const { h, m, s } = formatStepDuration(seconds);
    if (h > 0) return tv("durationHour", { h, m });
    if (m > 0 && s > 0) return tv("durationMinSec", { m, s });
    if (m > 0) return tv("durationMin", { m });
    return tv("durationSec", { s });
  };

  const amountText = (i: CookIngredient) => {
    if (i.toTaste) return tv("toTaste");
    if (!i.amount) return null;
    return i.approx ? `≈ ${i.amount}` : i.amount;
  };

  const otherRunning = now === null ? [] : timers.filter((tm) => tm.stepId !== step?.id);

  if (!step) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-4 px-gutter text-center">
        <ChefHat className="size-10 text-accent-text" aria-hidden="true" />
        <p className="type-body text-fg">{t("noSteps")}</p>
        <Button asChild variant="secondary">
          <Link href={recipeHref}>{t("backToRecipe")}</Link>
        </Button>
      </div>
    );
  }

  const isDone = done.includes(step.id);
  const last = index === total - 1;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col" data-testid="cook-mode">
      {/* topo: sair, título, ingredientes */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-bg/95 px-gutter py-2 backdrop-blur safe-top">
        <IconButton asChild label={t("backToRecipe")} icon={<X />} size="lg" variant="ghost">
          <Link href={recipeHref} data-testid="cook-back" />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="type-overline text-accent-text">{t("eyebrow")}</span>
          <h1 className="truncate text-base font-semibold text-fg">{model.title}</h1>
        </div>
        <Button variant="secondary" size="lg" leadingIcon={<ListChecks />} onClick={() => setIngredientsOpen(true)} className="min-h-12" data-testid="cook-ingredients-open">
          <span className="sr-only sm:not-sr-only">{t("ingredients.open")}</span>
        </Button>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col gap-5 px-gutter pb-40 pt-5 outline-none">
        {/* avisos ativos: alarme e cronômetros de outras etapas */}
        <p role="alert" aria-live="assertive" className={cn("rounded-xl px-4 py-3 text-base font-semibold", alert ? "bg-warning-soft text-fg" : "sr-only")} data-testid="cook-alert">
          {alert}
        </p>
        {otherRunning.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t("timer.others")}>
            {otherRunning.map((tm) => {
              const finished = timerDone(tm, now ?? 0);
              return (
                <li key={tm.stepId}>
                  <Button variant={finished ? "primary" : "secondary"} size="md" leadingIcon={finished ? <BellRing /> : <Timer />} onClick={() => setIndex(Math.max(0, stepNumber(tm.stepId) - 1))}>
                    {t("timer.otherLabel", { n: stepNumber(tm.stepId), time: finished ? t("timer.finishedShort") : formatClock(timerRemainingMs(tm, now ?? 0)) })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm font-medium uppercase tracking-[0.12em] text-accent-text" aria-live="polite" aria-atomic="true" data-testid="cook-progress">
            {t("progress", { n: step.number, total })}
          </p>
          <ProgressBar value={done.length} max={total} label={t("doneCount", { n: done.length, total })} />
          <p className="type-caption text-fg-muted">{t("doneCount", { n: done.length, total })}</p>
        </div>

        <section
          key={step.id}
          aria-labelledby="cook-step-title"
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 motion-safe:animate-fade-in sm:p-7"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          data-testid="cook-step"
        >
          <h2 id="cook-step-title" className="sr-only">
            {tv("step", { n: step.number })}
          </h2>
          <p className="text-[1.625rem] font-medium leading-snug text-fg text-pretty whitespace-pre-line sm:text-3xl" data-testid="cook-instruction">
            {step.instruction}
          </p>

          {(step.temperatureC !== null || step.durationSeconds) && (
            <p className="flex flex-wrap gap-2">
              {step.durationSeconds ? (
                <Badge variant="neutral" icon={<Timer />}>
                  {durationText(step.durationSeconds)}
                </Badge>
              ) : null}
              {step.temperatureC !== null ? (
                <Badge variant="neutral" icon={<Thermometer />}>
                  {tv("temperature", { c: step.temperatureC })}
                </Badge>
              ) : null}
            </p>
          )}

          {step.ingredients.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl bg-surface-elevated p-4">
              <h3 className="text-sm font-semibold text-fg">{t("stepIngredients")}</h3>
              <ul className="flex flex-col gap-1.5" data-testid="cook-step-ingredients">
                {step.ingredients.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 text-lg text-fg">
                    {amountText(i) ? <span className="font-semibold type-numeric">{amountText(i)}</span> : null}
                    <span>{i.name}</span>
                    {i.optional ? <span className="type-caption text-fg-muted">({tv("optional")})</span> : null}
                    {i.notScaled ? <span className="type-caption text-fg-muted">{t("notScaled")}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.image && (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border">
              <Image src={step.image.src} alt={step.image.alt} fill unoptimized sizes="(min-width: 768px) 42rem, 100vw" className="object-cover" />
            </div>
          )}

          {step.tip && (
            <p className="flex items-start gap-2 rounded-lg bg-surface-elevated px-3 py-2 type-body text-fg">
              <Lightbulb className="mt-1 size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span>
                <span className="font-semibold">{tv("tip")}: </span>
                {step.tip}
              </span>
            </p>
          )}

          {step.durationSeconds ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border p-4" data-testid="cook-timer">
              {!timer ? (
                <Button variant="secondary" size="lg" leadingIcon={<Timer />} onClick={onStartTimer} disabled={!hydrated} className="min-h-14 text-lg" data-testid="cook-timer-start">
                  {t("timer.start", { time: formatClock(step.durationSeconds * 1000) })}
                </Button>
              ) : timerDone(timer, now ?? 0) ? (
                <>
                  <p className="flex items-center gap-2 text-2xl font-semibold text-fg">
                    <BellRing className="size-6 text-warning" aria-hidden="true" />
                    {t("timer.finished")}
                  </p>
                  <Button variant="primary" size="lg" leadingIcon={<Check />} onClick={() => onCancelTimer(step.id)} className="min-h-14 text-lg" data-testid="cook-timer-dismiss">
                    {ringing.includes(step.id) ? t("timer.dismiss") : t("timer.clear")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-fg-muted">{t("timer.remaining")}</span>
                    <span role="timer" aria-label={t("timer.remainingLabel", { time: formatClock(timerRemainingMs(timer, now ?? 0)) })} className="font-mono text-5xl font-medium tabular-nums text-fg" data-testid="cook-timer-clock">
                      {formatClock(timerRemainingMs(timer, now ?? 0))}
                    </span>
                  </p>
                  <Button variant="ghost" size="lg" leadingIcon={<TimerOff />} onClick={() => onCancelTimer(step.id)} className="min-h-14" data-testid="cook-timer-cancel">
                    {t("timer.cancel")}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          <Button
            variant={isDone ? "primary" : "secondary"}
            size="lg"
            aria-pressed={isDone}
            leadingIcon={isDone ? <CircleCheck /> : <Circle />}
            onClick={() => setDone((list) => toggleDone(list, step.id))}
            className="min-h-14 text-base"
            data-testid="cook-step-done"
          >
            {isDone ? t("stepDone") : t("markDone")}
          </Button>
        </section>

        {last && (
          <section aria-labelledby="cook-finish-title" className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 p-5">
            <h2 id="cook-finish-title" className="type-h3 text-fg">
              {t("complete.title")}
            </h2>
            {completed ? (
              <p className="flex items-center gap-2 type-body text-fg" data-testid="cook-completed">
                <CircleCheck className="size-5 text-success" aria-hidden="true" />
                {completed}
              </p>
            ) : (
              <>
                <p className="type-body-sm text-fg-muted">{t("complete.description")}</p>
                <Button variant="primary" size="lg" leadingIcon={<Check />} onClick={onComplete} loading={completing} className="min-h-14">
                  {t("complete.button")}
                </Button>
              </>
            )}
          </section>
        )}

        {/* preferências: tela acesa e som do alarme */}
        <section aria-label={t("settings")} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          {wake === "unsupported" || wake === "denied" ? (
            <p className="flex items-start gap-2 type-body-sm text-fg-muted" data-testid="cook-wake-unsupported">
              <SunDim className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {wake === "unsupported" ? t("wake.unsupported") : t("wake.denied")}
            </p>
          ) : (
            <Switch
              id="cook-keep-awake"
              checked={keepAwake}
              onCheckedChange={setKeepAwake}
              label={
                <span className="inline-flex items-center gap-2">
                  <Sun className="size-4 text-accent-text" aria-hidden="true" />
                  {t("wake.label")}
                </span>
              }
              description={wake === "active" ? t("wake.active") : t("wake.off")}
            />
          )}
          <Button variant="ghost" size="lg" aria-pressed={sound} leadingIcon={sound ? <Volume2 /> : <VolumeX />} onClick={onToggleSound} className="justify-start" data-testid="cook-sound">
            {sound ? t("sound.on") : t("sound.off")}
          </Button>
          <p className="type-caption text-fg-muted">{t("timer.background")}</p>
        </section>

        <p className="type-caption text-fg-muted">{t("hint")}</p>
      </main>

      {/* navegação fixa embaixo, alvo de 56 px */}
      <nav aria-label={t("navLabel")} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 px-gutter py-3">
          <Button variant="secondary" size="lg" leadingIcon={<ArrowLeft />} onClick={() => go("prev")} disabled={index === 0} className="h-14 min-h-14 text-base" data-testid="cook-prev">
            {t("prev")}
          </Button>
          {last ? (
            <Button asChild variant="primary" size="lg" className="h-14 min-h-14 text-base">
              <Link href={recipeHref} data-testid="cook-finish-link">
                {t("backToRecipe")}
              </Link>
            </Button>
          ) : (
            <Button variant="primary" size="lg" trailingIcon={<ArrowRight />} onClick={() => go("next")} className="h-14 min-h-14 text-base" data-testid="cook-next">
              {t("next")}
            </Button>
          )}
        </div>
      </nav>

      <Sheet open={ingredientsOpen} onOpenChange={setIngredientsOpen} title={t("ingredients.title")} description={model.servings ? t("ingredients.scaled", { n: model.servings, base: model.baseServings ?? model.servings }) : model.baseServings ? t("ingredients.servings", { n: model.baseServings }) : undefined}>
        <ul className="flex flex-col divide-y divide-border py-2" data-testid="cook-all-ingredients">
          {model.ingredients.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 py-2.5 text-base text-fg">
              {amountText(i) ? <span className="font-semibold type-numeric">{amountText(i)}</span> : null}
              <span>{i.name}</span>
              {i.note ? <span className="type-caption text-fg-muted">{i.note}</span> : null}
              {i.optional ? <span className="type-caption text-fg-muted">({tv("optional")})</span> : null}
              {i.notScaled ? <span className="type-caption text-fg-muted">{t("notScaled")}</span> : null}
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
