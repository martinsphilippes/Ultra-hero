"use client";

import { Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Checkbox, FormField, Input } from "@/components/ui";
import { REST_HOURS_MAX, REST_HOURS_STEP, clampRestHours, readRest, writeRest, type RestLog } from "@/lib/routine/local-log";
import { LocalNote } from "./LocalNote";
import { useLocalStorage } from "./use-local-storage";

type Props = { localDate: string };

// Descanso do dia: "descansei hoje" e horas opcionais, sem meta prescrita; fica só neste aparelho.
export function RestBlock({ localDate }: Props) {
  const t = useTranslations("me.today.rest");
  const tc = useTranslations("common.a11y");
  const restedId = useId();
  const { storage, ready } = useLocalStorage();
  const [log, setLog] = useState<RestLog>({ rested: false, hours: null });
  const [hoursText, setHoursText] = useState("");

  useEffect(() => {
    if (!ready) return;
    const stored = readRest(storage, localDate);
    setLog(stored);
    setHoursText(stored.hours === null ? "" : String(stored.hours));
  }, [ready, storage, localDate]);

  function persist(next: RestLog) {
    setLog(storage ? writeRest(storage, localDate, next) : next);
  }

  // Só grava ao sair do campo: digitar "7." ou "7,5" não pode ser arredondado no meio.
  function onHoursBlur() {
    if (hoursText.trim() === "") {
      persist({ ...log, hours: null });
      return;
    }
    const hours = clampRestHours(Number(hoursText.replace(",", ".")));
    setHoursText(String(hours));
    persist({ ...log, hours });
  }

  return (
    <section aria-labelledby="rest-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
          <Moon className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 id="rest-title" className="type-h3 text-fg">
            {t("title")}
          </h3>
          <p className="type-caption text-fg-muted">{t("description")}</p>
        </div>
      </div>

      <Checkbox id={restedId} label={t("rested")} checked={log.rested} disabled={!ready} onChange={(e) => persist({ ...log, rested: e.target.checked })} />

      <FormField label={t("hours")} optionalLabel={tc("optional")} hint={t("hoursHint")}>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={REST_HOURS_MAX}
          step={REST_HOURS_STEP}
          value={hoursText}
          disabled={!ready}
          onChange={(e) => setHoursText(e.target.value)}
          onBlur={onHoursBlur}
          className="max-w-32 font-mono type-numeric"
        />
      </FormField>

      <LocalNote note={t("localNote")} warning={ready && !storage ? t("noStorage") : null} />
    </section>
  );
}
