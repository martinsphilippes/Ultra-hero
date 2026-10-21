"use client";

import { Droplets, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { IconButton, Label, ProgressBar, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import {
  HYDRATION_GOAL_DEFAULT_ML,
  HYDRATION_GOAL_OPTIONS_ML,
  HYDRATION_MAX_ML,
  HYDRATION_STEP_ML,
  addHydration,
  formatGoalLiters,
  formatLiters,
  readHydration,
  readHydrationGoal,
  writeHydrationGoal,
} from "@/lib/routine/local-log";
import { LocalNote } from "./LocalNote";
import { useLocalStorage } from "./use-local-storage";

type Props = { localDate: string; locale: Locale };

// Hidratação do dia: ml em passos de 250, meta ajustável; tudo fica só neste aparelho.
export function HydrationBlock({ localDate, locale }: Props) {
  const t = useTranslations("me.today.hydration");
  const goalId = useId();
  const { storage, ready } = useLocalStorage();
  const [ml, setMl] = useState(0);
  const [goal, setGoal] = useState(HYDRATION_GOAL_DEFAULT_ML);

  useEffect(() => {
    if (!ready) return;
    setMl(readHydration(storage, localDate));
    setGoal(readHydrationGoal(storage));
  }, [ready, storage, localDate]);

  // Sem storage o valor vive só em memória (o aviso explica); a lib tolera storage null.
  function change(delta: number) {
    setMl((prev) => (storage ? addHydration(storage, localDate, delta) : Math.min(HYDRATION_MAX_ML, Math.max(0, prev + delta))));
  }

  function onGoal(value: string) {
    const next = Number(value);
    setGoal(storage ? writeHydrationGoal(storage, next) : next);
  }

  const value = formatLiters(ml, locale);
  const goalLabel = formatGoalLiters(goal, locale);

  return (
    <section aria-labelledby="hydration-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
          <Droplets className="size-5" />
        </span>
        <h3 id="hydration-title" className="type-h3 text-fg">
          {t("title")}
        </h3>
      </div>

      <div className="flex flex-col gap-1">
        <p className="type-h1 type-numeric text-fg" aria-live="polite" aria-atomic="true">
          <span className="sr-only">{t("value", { value })}</span>
          <span aria-hidden="true">{value}</span>
        </p>
        <p className="type-caption text-fg-muted">{t("goalLabel", { goal: goalLabel })}</p>
      </div>

      <ProgressBar value={ml} max={goal} label={t("progressLabel")} tone="info" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton label={t("remove")} icon={<Minus />} variant="secondary" onClick={() => change(-HYDRATION_STEP_ML)} disabled={!ready || ml <= 0} />
          <IconButton label={t("add")} icon={<Plus />} variant="primary" onClick={() => change(HYDRATION_STEP_ML)} disabled={!ready || ml >= HYDRATION_MAX_ML} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={goalId}>{t("goalSelect")}</Label>
          <Select id={goalId} value={String(goal)} onChange={(e) => onGoal(e.target.value)} selectSize="sm" disabled={!ready} className="w-28">
            {HYDRATION_GOAL_OPTIONS_ML.map((option) => (
              <option key={option} value={option}>
                {t("goalOption", { goal: formatGoalLiters(option, locale) })}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <LocalNote note={t("localNote")} warning={ready && !storage ? t("noStorage") : null} />
    </section>
  );
}
