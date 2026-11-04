"use client";

import { Repeat, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, DatePicker, FormField, SegmentedControl, Switch, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { saveRecurrenceAction } from "@/lib/roadmap/actions";
import type { DealRecurrence } from "@/lib/roadmap/phase3-queries";
import { CONTRACT_CYCLES, type ContractCycle } from "@/lib/roadmap/recurrence";
import { RoadmapDoneButton } from "./RoadmapDoneButton";

// Serviço recorrente (0111, D2): contrato com ciclo (semanal/quinzenal/mensal), início e fim opcional. A cada ciclo o
// banco gera as etapas recorrentes do roteiro (ex.: 4 relatórios semanais e 2 trocas quinzenais por mês); aqui a equipe
// configura e marca as ocorrências do ciclo corrente (e as atrasadas). Mobile first: um cartão, alvos ≥ 44 px.
export function RecurrenceCard({ dealId, data, defaultStart }: { dealId: string; data: DealRecurrence; defaultStart: string }) {
  const t = useTranslations("roadmap.recurrence");
  const tr = useTranslations("roadmap.recurrences");
  const ts = useTranslations("roadmap.sectors");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [cycle, setCycle] = useState<ContractCycle>(data.config?.cycle ?? "monthly");
  const [startsOn, setStartsOn] = useState(data.config?.startsOn ?? defaultStart);
  const [endsOn, setEndsOn] = useState(data.config?.endsOn ?? "");
  const [active, setActive] = useState(data.config?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const day = (d: string | null) => (d ? formatPlainDate(d, locale, { day: "2-digit", month: "2-digit" }) : "—");
  const changed = !data.config || data.config.cycle !== cycle || data.config.startsOn !== startsOn || (data.config.endsOn ?? "") !== endsOn || data.config.active !== active;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!startsOn) return setError(t("startRequired"));
    if (endsOn && endsOn <= startsOn) return setError(t("endAfterStart"));
    if (data.config && (data.config.cycle !== cycle || data.config.startsOn !== startsOn) && !window.confirm(t("rescheduleConfirm"))) return;
    start(async () => {
      const result = await saveRecurrenceAction({ dealId, cycle, startsOn, endsOn, active });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="recurrence-title" data-testid="deal-recurrence">
      <div className="flex flex-col gap-1">
        <h2 id="recurrence-title" className="flex items-center gap-2 text-base font-semibold text-fg">
          <Repeat className="size-4" aria-hidden="true" />
          {t("title")}
          {data.config ? <Badge size="sm" variant={data.config.active ? "success" : "neutral"}>{data.config.active ? t("active") : t("paused")}</Badge> : null}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="type-caption font-semibold text-fg-muted">{t("baseTitle")}</h3>
        <ul className="flex flex-col gap-1">
          {data.base.map((b) => (
            <li key={b.position} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="text-fg">{b.title}</span>
              <span className="type-caption text-fg-muted">
                {b.recurrence ? tr(b.recurrence) : "—"}
                {b.sector ? ` · ${ts(b.sector)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {data.canEdit ? (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="recurrence-form">
          <FormField label={t("cycle")} hint={t("cycleHint")}>
            <SegmentedControl<ContractCycle> aria-label={t("cycle")} value={cycle} onValueChange={setCycle} options={CONTRACT_CYCLES.map((c) => ({ value: c, label: t(`cycles.${c}`) }))} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("startsOn")} required>
              <DatePicker value={startsOn} onChange={setStartsOn} disabled={pending} data-testid="recurrence-start" />
            </FormField>
            <FormField label={t("endsOn")} hint={t("endsOnHint")}>
              <DatePicker value={endsOn} onChange={setEndsOn} disabled={pending} min={startsOn || undefined} data-testid="recurrence-end" />
            </FormField>
          </div>
          {data.config ? <Switch checked={active} onCheckedChange={setActive} label={t("activeLabel")} description={t("activeHint")} disabled={pending} /> : null}
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" leadingIcon={<Save />} loading={pending} disabled={!changed} className="w-full sm:w-fit" data-testid="recurrence-save">
            {data.config ? t("save") : t("create")}
          </Button>
        </form>
      ) : data.config ? (
        <p className="text-sm text-fg">{t("summary", { cycle: t(`cycles.${data.config.cycle}`), date: day(data.config.startsOn) })}</p>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("none")}</p>
      )}

      {data.config ? (
        <div className="flex flex-col gap-2" data-testid="recurrence-occurrences">
          <p className="type-caption text-fg-muted">
            {data.current ? t("current", { n: data.current.no + 1, from: day(data.current.startsOn), to: day(data.current.endsOn) }) : t("noCurrent")}
            {data.nextOn ? ` · ${t("next", { date: day(data.nextOn) })}` : ""}
            {data.stats.done > 0 ? ` · ${t("stats", { done: data.stats.done, onTime: data.stats.onTime })}` : ""}
          </p>
          {data.occurrences.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("noOccurrences")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {data.occurrences.map((o) => (
                <li key={o.id} className="flex items-center gap-2 px-3 py-2">
                  {o.status !== "done" && o.canWork ? (
                    <RoadmapDoneButton taskId={o.id} dealId={dealId} title={o.title} />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
                      {o.status === "done" ? "✓" : "•"}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={o.status === "done" ? "text-sm text-fg-muted line-through" : "text-sm text-fg"}>{o.title}</span>
                    <span className="type-caption text-fg-muted">
                      {t("dueOn", { date: day(o.dueOn) })}
                      {o.sector ? ` · ${ts(o.sector)}` : ""}
                      {o.assigneeName ? ` · ${o.assigneeName}` : ""}
                    </span>
                  </span>
                  {o.late ? (
                    <Badge size="sm" variant="danger">
                      {t("late")}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
