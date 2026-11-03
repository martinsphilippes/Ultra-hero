"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { distinctKinds, gridRange, groupEventsByDay, initialDay, monthWeeks, moveFocus } from "@/lib/calendar/grid";
import { monthKey, shiftMonth } from "@/lib/calendar/ics";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { EVENT_KINDS } from "@/lib/calendar/vocab";
import { cn } from "@/lib/utils";
import { EventNewOnDayButton, useEventEditor } from "./EventEditor";
import { EventList } from "./EventList";
import { KIND_DOT } from "./kinds";

type Props = {
  events: CalendarEvent[];
  timeZone: string;
  portal: "agency" | "brand" | "office";
  year: number;
  month: number;
  /** Hoje (YYYY-MM-DD) no fuso, calculado no servidor (evita divergência na hidratação). */
  today: string;
  /** Rota da agenda (navegação de mês por ?mes=YYYY-MM, carga completa, como antes). */
  base: string;
  /** Filtros que acompanham a troca de mês. */
  extraParams?: Record<string, string | undefined>;
  /** Dia pedido pela URL (?dia=YYYY-MM-DD), por exemplo pelo botão Hoje vindo de outro mês. */
  requestedDay?: string | null;
  emptyTitle: string;
  emptyHint?: string;
  /** 0094 (agenda do herói): atalho no cabeçalho da lista do dia (ex.: "Compromisso neste dia"), com o dia e o nome dele. */
  dayAction?: (day: string, dateLabel: string) => ReactNode;
  /** 0094: conteúdo extra e ações de cada item da lista do dia (checklist, editar/excluir). */
  renderExtra?: (event: CalendarEvent) => ReactNode;
  renderActions?: (event: CalendarEvent) => ReactNode;
  /** 0094: avisa o dia selecionado na grade (o "Novo compromisso" do topo abre nele). */
  onDayChange?: (day: string) => void;
};

// Agenda em grade (bloco 9), compartilhada pelos três portais. Mês com semanas de segunda a domingo; cada dia é
// um botão (role="grid" com foco móvel pelas setas). Celular: quadrado compacto com pontos por tipo e o número
// de compromissos; a partir de sm: até 2 (lg: 3) títulos e "+N". Tocar num dia mostra a lista dele embaixo,
// reaproveitando a EventList (ações de editar/remover continuam lá). As consultas e filtros são os de cada página.
// 0086: na agência (dentro do EventEditorProvider), o dia selecionado vai para o editor — "Novo compromisso" abre
// nesse dia — e o cabeçalho da lista do dia ganha o atalho "Compromisso neste dia" (só para quem pode criar).
export function AgendaCalendar({ events, timeZone, portal, year, month, today, base, extraParams = {}, requestedDay, emptyTitle, emptyHint, dayAction, renderExtra, renderActions, onDayChange }: Props) {
  const t = useTranslations("commercial.agenda");
  const tk = useTranslations("commercial.eventKinds");
  const locale = useLocale() as Locale;
  const titleId = useId();
  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  const range = useMemo(() => gridRange(year, month), [year, month]);
  const byDay = useMemo(() => groupEventsByDay(events, timeZone, range), [events, timeZone, range]);
  const [selected, setSelected] = useState(() => initialDay(year, month, today, byDay.keys(), requestedDay));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const editor = useEventEditor();
  const setEditorDay = editor?.setSelectedDay;
  useEffect(() => {
    setEditorDay?.(selected);
    onDayChange?.(selected);
  }, [selected, setEditorDay, onDayChange]);

  const thisMonth = monthKey(year, month);
  const monthHasEvents = [...byDay.keys()].some((d) => d.slice(0, 7) === thisMonth);
  const kindsInView = EVENT_KINDS.filter((k) => [...byDay.values()].some((list) => list.some((e) => e.kind === k)));

  const href = (y: number, m: number, day?: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) if (v) params.set(k, v);
    params.set("mes", monthKey(y, m));
    if (day) params.set("dia", day);
    return `${base}?${params.toString()}`;
  };
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const todayInView = today >= range.first && today <= range.last;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  // nomes dos dias no idioma, a partir de uma segunda conhecida (2024-01-01)
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1 + i));
    return {
      long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(d),
      short: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d).replace(/\.$/, ""),
      narrow: new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(d),
    };
  });
  const fullDate = (day: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

  function focusDay(day: string) {
    setSelected(day);
    // o botão do novo dia já existe (a grade não muda); foca depois do render
    requestAnimationFrame(() => buttons.current.get(day)?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const target = moveFocus(day, event.key, range);
    if (!target) return;
    event.preventDefault();
    if (target !== day) focusDay(target);
  }

  const selectedEvents = byDay.get(selected) ?? [];
  const link =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <section className="flex flex-col gap-4" data-testid="agenda-calendar">
      <nav aria-label={t("monthNav")} className="flex items-center justify-between gap-2" data-testid="month-nav">
        <a href={href(prev.year, prev.month)} className={link} aria-label={t("prevMonth")} data-testid="agenda-prev">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </a>
        <h2 id={titleId} className="flex-1 text-center text-base font-semibold text-fg first-letter:uppercase" aria-live="polite">
          {monthLabel}
        </h2>
        {todayInView ? (
          <button type="button" className={cn(link, "px-3 text-sm font-medium")} onClick={() => focusDay(today)} data-testid="agenda-today">
            {t("today")}
          </button>
        ) : (
          <a href={href(Number(today.slice(0, 4)), Number(today.slice(5, 7)), today)} className={cn(link, "px-3 text-sm font-medium")} data-testid="agenda-today">
            {t("today")}
          </a>
        )}
        <a href={href(next.year, next.month)} className={link} aria-label={t("nextMonth")} data-testid="agenda-next">
          <ChevronRight className="size-5" aria-hidden="true" />
        </a>
      </nav>

      <div role="grid" aria-labelledby={titleId} aria-readonly="true" className="flex flex-col gap-1" data-testid="agenda-grid">
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div key={w.long} role="columnheader" aria-label={w.long} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <span className="sm:hidden" aria-hidden="true">
                {w.narrow}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                {w.short}
              </span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} role="row" className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const list = byDay.get(d.date) ?? [];
              const isToday = d.date === today;
              const isSelected = d.date === selected;
              const dots = distinctKinds(list, 3);
              const label = `${fullDate(d.date)}${isToday ? `, ${t("todayMark")}` : ""}: ${t("dayCount", { count: list.length })}`;
              return (
                <div key={d.date} role="gridcell" aria-selected={isSelected} className="min-w-0">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) buttons.current.set(d.date, el);
                      else buttons.current.delete(d.date);
                    }}
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={label}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => setSelected(d.date)}
                    onKeyDown={(e) => onKeyDown(e, d.date)}
                    data-testid="agenda-day"
                    data-date={d.date}
                    data-count={list.length}
                    className={cn(
                      "flex aspect-square w-full min-w-0 flex-col items-stretch gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition-colors sm:aspect-auto sm:min-h-24 sm:p-1.5 lg:min-h-28",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      isSelected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
                      !d.inMonth && !isSelected && "bg-transparent opacity-50",
                    )}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                          isToday ? "bg-accent text-accent-fg" : d.inMonth ? "text-fg" : "text-fg-subtle",
                        )}
                      >
                        {d.day}
                      </span>
                      {list.length > 0 ? <span className="text-[0.6875rem] font-semibold tabular-nums text-fg-muted sm:hidden">{list.length}</span> : null}
                    </span>
                    {/* celular: só pontos por tipo (até 3) */}
                    {dots.length > 0 ? (
                      <span className="mt-auto flex flex-wrap items-center gap-0.5 sm:hidden" aria-hidden="true">
                        {dots.map((k) => (
                          <span key={k} className={cn("size-1.5 rounded-full", KIND_DOT[k])} data-kind={k} />
                        ))}
                      </span>
                    ) : null}
                    {/* tablet/desktop: até 2 (lg: 3) títulos com o marcador do tipo e "+N" */}
                    {list.length > 0 ? (
                      <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden="true">
                        {list.slice(0, 3).map((e, i) => (
                          <span key={e.id} className={cn("flex min-w-0 items-center gap-1 text-[0.6875rem] leading-tight text-fg", i === 2 && "hidden lg:flex")}>
                            <span className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[e.kind])} />
                            <span className="truncate">{e.title}</span>
                          </span>
                        ))}
                        {list.length > 2 ? <span className="text-[0.6875rem] font-semibold text-fg-muted lg:hidden">{t("more", { count: list.length - 2 })}</span> : null}
                        {list.length > 3 ? <span className="hidden text-[0.6875rem] font-semibold text-fg-muted lg:inline">{t("more", { count: list.length - 3 })}</span> : null}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {kindsInView.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label={t("legend")} data-testid="agenda-legend">
          {kindsInView.map((k) => (
            <li key={k} className="flex items-center gap-1.5 type-caption text-fg-muted">
              <span className={cn("size-2 rounded-full", KIND_DOT[k])} aria-hidden="true" />
              {tk(k)}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby={`${titleId}-day`} className="flex flex-col gap-2" data-testid="agenda-day-panel" data-date={selected}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${titleId}-day`} className="text-sm font-semibold text-fg first-letter:uppercase" aria-live="polite">
            {fullDate(selected)} · {t("dayCount", { count: selectedEvents.length })}
          </h3>
          {portal === "agency" ? <EventNewOnDayButton day={selected} dateLabel={fullDate(selected)} /> : (dayAction?.(selected, fullDate(selected)) ?? null)}
        </div>
        {selectedEvents.length > 0 ? (
          <EventList events={selectedEvents} timeZone={timeZone} portal={portal} emptyTitle={emptyTitle} flat renderExtra={renderExtra} renderActions={renderActions} />
        ) : (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<CalendarDays />} title={monthHasEvents ? t("dayEmpty") : emptyTitle} description={monthHasEvents ? undefined : emptyHint} size="sm" />
          </div>
        )}
      </section>
    </section>
  );
}
