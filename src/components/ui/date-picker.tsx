"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addMonthsToDay,
  canShowMonth,
  hourOptions,
  initialFocusDay,
  isDateKey,
  isDateTimeKey,
  isOutOfRange,
  joinDateTime,
  localTodayKey,
  minuteOptions,
  monthOf,
  pickerMoveFocus,
  pickerWeeks,
  splitDateTime,
} from "@/lib/calendar/date-picker";
import { shiftMonth } from "@/lib/calendar/ics";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { IconButton } from "./icon-button";
import { fieldBase } from "./input";
import { Select } from "./select";
import { Sheet } from "./sheet";

// Campo de data com a "caixa da agenda" (pedido do responsável: todo campo de data abre um calendário mensal, em vez
// do seletor nativo, que no iPhone vira rolete). Decisões:
// - Valor em texto, no MESMO formato do input nativo ("YYYY-MM-DD"; no DateTimePicker "YYYY-MM-DDTHH:mm", igual ao
//   datetime-local), para quem usa não mudar a lógica. onChange recebe a string ("" ao limpar), não um evento.
// - Controlado (value + onChange) ou não controlado (defaultValue). Com `name`, um <input type="hidden"> leva o valor
//   nos formulários GET/server (filtros) — o hidden também é o jeito simples de ler o valor nos testes e2e.
// - Celular: abre num Sheet de baixo; a partir de md (768px), num Dialog pequeno no centro.
// - Semana começa no domingo (padrão BR); grade sempre com 6 semanas; dias fora de min/max ficam desabilitados.
// - Teclado: setas (dia/semana, atravessando o mês), Home/End, PageUp/PageDown (mês; Shift: ano), Enter/Espaço
//   escolhem, Esc fecha (pelo <dialog>).
// - DateTimePicker: tocar no dia já grava (com 09:00 se ainda não havia hora); hora e minutos em selects (minutos de
//   5 em 5) e "Pronto" fecha. min/max limitam só os dias.

type Size = "sm" | "md";

type BaseProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Obrigatório: esconde o botão "Limpar". */
  required?: boolean;
  /** Nome do <input type="hidden"> enviado no formulário. */
  name?: string;
  id?: string;
  placeholder?: string;
  /** Título da caixa (padrão: "Escolher data"). */
  title?: string;
  inputSize?: Size;
  className?: string;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
};

export type DatePickerProps = BaseProps;
export type DateTimePickerProps = BaseProps & { /** Passo dos minutos (padrão 5). */ minuteStep?: number };

export function DatePicker(props: DatePickerProps) {
  return <PickerField {...props} mode="date" />;
}

export function DateTimePicker(props: DateTimePickerProps) {
  return <PickerField {...props} mode="datetime" />;
}

const triggerSizes: Record<Size, string> = {
  sm: "h-9 min-h-9 px-3 text-sm",
  md: "h-11 min-h-11 px-3.5 text-base md:text-sm",
};

const DESKTOP_QUERY = "(min-width: 768px)";

function PickerField({
  mode,
  value,
  defaultValue,
  onChange,
  min,
  max,
  disabled,
  required,
  name,
  id,
  placeholder,
  title,
  inputSize = "md",
  className,
  invalid,
  minuteStep = 5,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "data-testid": testId,
}: DateTimePickerProps & { mode: "date" | "datetime" }) {
  const t = useTranslations("common.datePicker");
  const locale = useLocale();
  const textId = useId();
  const autoId = useId();
  const triggerId = id ?? `date-picker-${autoId}`;
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = (controlled ? value : inner) ?? "";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"sheet" | "dialog">("sheet");

  const setValue = useCallback(
    (next: string) => {
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );

  const valid = mode === "date" ? isDateKey(current) : isDateTimeKey(current);
  const label = valid ? formatValue(current, mode, locale) : "";

  function openPicker() {
    if (disabled) return;
    setKind(typeof window !== "undefined" && window.matchMedia?.(DESKTOP_QUERY).matches ? "dialog" : "sheet");
    setOpen(true);
  }

  const dialogTitle = title ?? (mode === "date" ? t("chooseDate") : t("chooseDateTime"));
  const panel = open ? (
    <PickerPanel
      mode={mode}
      value={valid ? current : ""}
      min={min}
      max={max}
      required={required}
      minuteStep={minuteStep}
      onPick={(next, close) => {
        setValue(next);
        if (close) setOpen(false);
      }}
      onDone={() => setOpen(false)}
    />
  ) : null;

  return (
    <span className={cn("relative block", className)}>
      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={[textId, describedBy].filter(Boolean).join(" ")}
        // botão não aceita aria-invalid/aria-required: o erro vem pelo aria-describedby do FormField e o
        // obrigatório pelo rótulo; aqui só o visual do campo inválido
        data-invalid={invalid || ariaInvalid === true || ariaInvalid === "true" || undefined}
        data-testid={testId}
        data-value={current}
        className={cn(fieldBase, triggerSizes[inputSize], "flex items-center justify-between gap-2 text-left data-invalid:border-danger")}
      >
        <span id={textId} className={cn("min-w-0 truncate tabular-nums", !label && "text-fg-subtle")}>
          {label || placeholder || (mode === "date" ? t("placeholder") : t("placeholderDateTime"))}
        </span>
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
      </button>
      {required ? (
        // obrigatório: um campo invisível (não hidden, que o navegador não valida) mantém a validação nativa do
        // formulário — o aviso "preencha este campo" aparece embaixo do botão, como no input de data de antes
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          name={name}
          value={current}
          onChange={() => {}}
          onInvalid={() => document.getElementById(triggerId)?.focus()}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      ) : name ? (
        <input type="hidden" name={name} value={current} />
      ) : null}
      {kind === "dialog" ? (
        <Dialog open={open} onOpenChange={setOpen} title={dialogTitle} size="sm">
          {panel}
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen} title={dialogTitle}>
          {panel}
        </Sheet>
      )}
    </span>
  );
}

function formatValue(value: string, mode: "date" | "datetime", locale: string): string {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (mode === "date") {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  }
  const [hh, mm] = value.slice(11, 16).split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, hh, mm)));
}

type PanelProps = {
  mode: "date" | "datetime" | "range";
  value: string;
  /** Período (mode "range"): início e fim já escolhidos ("" = nenhum). */
  rangeStart?: string;
  rangeEnd?: string;
  /** Período: grava início/fim; `close` fecha a caixa. */
  onRange?: (start: string, end: string, close: boolean) => void;
  min?: string;
  max?: string;
  required?: boolean;
  minuteStep: number;
  /** Grava o valor; `close` fecha a caixa. */
  onPick: (value: string, close: boolean) => void;
  onDone: () => void;
};

function PickerPanel({ mode, value, rangeStart = "", rangeEnd = "", onRange, min, max, required, minuteStep, onPick, onDone }: PanelProps) {
  const t = useTranslations("common.datePicker");
  const locale = useLocale();
  const titleId = useId();
  // hoje no relógio do aparelho (o painel só existe depois de aberto, no cliente: sem divergência de hidratação)
  const today = useMemo(() => localTodayKey(), []);
  const { date: selected, time } = splitDateTime(mode === "range" ? rangeStart : value);
  // período: 1º toque marca o início (vale como um dia só), 2º toque marca o fim e fecha
  const [phase, setPhase] = useState<"start" | "end">("start");
  const [focus, setFocus] = useState(() => initialFocusDay(selected, today, min, max));
  const [view, setView] = useState(() => monthOf(focus));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  const weeks = useMemo(() => pickerWeeks(view.year, view.month), [view.year, view.month]);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(view.year, view.month - 1, 1)));
  const weekdays = useMemo(
    () =>
      // a partir de um domingo conhecido (2024-01-07)
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.UTC(2024, 0, 7 + i));
        return {
          long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(d),
          narrow: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d).replace(/\.$/, "").slice(0, 3),
        };
      }),
    [locale],
  );
  const fullDate = (day: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

  // foca o botão do dia depois que a grade (talvez de outro mês) renderiza
  useEffect(() => {
    const day = pendingFocus.current;
    if (!day) return;
    pendingFocus.current = null;
    buttons.current.get(day)?.focus();
  });

  function moveTo(day: string) {
    setFocus(day);
    const m = monthOf(day);
    if (m.year !== view.year || m.month !== view.month) setView(m);
    pendingFocus.current = day;
  }

  const prev = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);
  const canPrev = canShowMonth(prev.year, prev.month, min, max);
  const canNext = canShowMonth(next.year, next.month, min, max);

  function showMonth(delta: number) {
    const target = shiftMonth(view.year, view.month, delta);
    setView(target);
    // o foco acompanha (mesmo dia no outro mês, dentro dos limites) sem roubar o foco da seta
    const day = initialFocusDay(addMonthsToDay(focus, delta), today, min, max);
    setFocus(day);
  }

  function pick(day: string) {
    if (isOutOfRange(day, min, max)) return;
    if (mode === "range") {
      if (phase === "start") {
        onRange?.(day, day, false);
        setPhase("end");
        moveTo(day);
      } else {
        const [a, b] = day < rangeStart ? [day, rangeStart] : [rangeStart, day];
        onRange?.(a, b, true);
      }
      return;
    }
    if (mode === "date") onPick(day, true);
    else {
      onPick(joinDateTime(day, time), false);
      moveTo(day);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const target = pickerMoveFocus(day, event.key, { shiftKey: event.shiftKey, min, max });
    if (!target) return;
    event.preventDefault();
    moveTo(target);
  }

  const todayDisabled = isOutOfRange(today, min, max);
  const [hh, mm] = (time || "09:00").split(":");
  function setTime(nextHour: string, nextMinute: string) {
    onPick(joinDateTime(selected || focus, `${nextHour}:${nextMinute}`), false);
  }

  const focusInView = focus.slice(0, 7) === `${view.year}-${String(view.month).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3 pb-2" data-testid="date-picker-panel">
      <div className="flex items-center justify-between gap-2">
        <IconButton label={t("prevMonth")} icon={<ChevronLeft />} variant="secondary" onClick={() => showMonth(-1)} disabled={!canPrev} data-testid="date-picker-prev" />
        <h3 id={titleId} className="flex-1 text-center text-base font-semibold text-fg first-letter:uppercase" aria-live="polite" data-testid="date-picker-month">
          {monthLabel}
        </h3>
        <IconButton label={t("nextMonth")} icon={<ChevronRight />} variant="secondary" onClick={() => showMonth(1)} disabled={!canNext} data-testid="date-picker-next" />
      </div>

      {mode === "range" ? (
        <p className="text-center type-caption text-fg-muted" aria-live="polite" data-testid="date-range-hint">
          {phase === "start" ? t("rangeStartHint") : t("rangeEndHint")}
        </p>
      ) : null}

      <div role="grid" aria-labelledby={titleId} className="flex flex-col gap-1" data-testid="date-picker-grid">
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div key={w.long} role="columnheader" aria-label={w.long} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <span aria-hidden="true">{w.narrow}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} role="row" className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const isToday = d.date === today;
              const rangeTo = mode === "range" && rangeEnd ? rangeEnd : selected;
              const isSelected = mode === "range" ? !!rangeStart && (d.date === rangeStart || d.date === rangeTo) : d.date === selected;
              const inRange = mode === "range" && !!rangeStart && d.date > rangeStart && d.date < rangeTo;
              const off = isOutOfRange(d.date, min, max);
              // dia que recebe o Tab: o foco, ou o 1º do mês visível se o foco ficou noutro mês
              const tabbable = focusInView ? d.date === focus : d.inMonth && d.day === 1;
              return (
                <div key={d.date} role="gridcell" aria-selected={isSelected} className="flex justify-center">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) buttons.current.set(d.date, el);
                      else buttons.current.delete(d.date);
                    }}
                    tabIndex={tabbable ? 0 : -1}
                    data-autofocus={tabbable && !off ? "" : undefined}
                    disabled={off}
                    aria-label={`${fullDate(d.date)}${isToday ? `, ${t("todayMark")}` : ""}`}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                    onClick={() => pick(d.date)}
                    onKeyDown={(e) => onKeyDown(e, d.date)}
                    data-testid="date-picker-day"
                    data-date={d.date}
                    className={cn(
                      "inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-medium tabular-nums transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      "disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through",
                      isSelected
                        ? "bg-accent text-accent-fg shadow-sm"
                        : inRange
                          ? "rounded-md bg-accent-soft text-fg"
                          : isToday
                          ? "border-2 border-accent text-fg hover:bg-surface-hover"
                          : d.inMonth
                            ? "text-fg hover:bg-surface-hover"
                            : "text-fg-subtle hover:bg-surface-hover",
                    )}
                  >
                    {d.day}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {mode === "datetime" ? (
        <fieldset className="flex items-end gap-2">
          <legend className="mb-1.5 text-sm font-medium text-fg">{t("time")}</legend>
          <div className="flex-1">
            <Select value={hh} onChange={(e) => setTime(e.target.value, mm)} aria-label={t("hour")} data-testid="date-picker-hour">
              {hourOptions().map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </div>
          <span aria-hidden="true" className="pb-2.5 font-semibold text-fg-muted">
            :
          </span>
          <div className="flex-1">
            <Select value={mm} onChange={(e) => setTime(hh, e.target.value)} aria-label={t("minute")} data-testid="date-picker-minute">
              {minuteOptions(minuteStep, mm).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex gap-2">
          <Button variant="secondary" disabled={todayDisabled} onClick={() => pick(today)} data-testid="date-picker-today">
            {t("today")}
          </Button>
          {!required && (mode === "range" ? rangeStart : value) ? (
            <Button variant="ghost" onClick={() => (mode === "range" ? onRange?.("", "", true) : onPick("", true))} data-testid="date-picker-clear">
              {t("clear")}
            </Button>
          ) : null}
        </div>
        {mode === "datetime" ? (
          <Button onClick={onDone} data-testid="date-picker-done">
            {t("done")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Período num campo só (pedido do responsável, 04/11: "De" e "Até" viram um campo; marca uma data e depois a outra).
// Abre a mesma caixa da agenda: o 1º toque marca o início (já vale como um dia só, fim = início), o 2º marca o fim e
// fecha; tocar antes do início troca a ordem. Valores no formato "YYYY-MM-DD", como no DatePicker. Com
// `startName`/`endName`, dois <input type="hidden"> levam os valores nos formulários GET (filtros).

export type DateRangePickerProps = {
  start?: string;
  end?: string;
  defaultStart?: string;
  defaultEnd?: string;
  onChange?: (start: string, end: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  startName?: string;
  endName?: string;
  id?: string;
  placeholder?: string;
  title?: string;
  inputSize?: Size;
  className?: string;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
};

export function DateRangePicker({
  start,
  end,
  defaultStart,
  defaultEnd,
  onChange,
  min,
  max,
  disabled,
  required,
  startName,
  endName,
  id,
  placeholder,
  title,
  inputSize = "md",
  className,
  invalid,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "data-testid": testId,
}: DateRangePickerProps) {
  const t = useTranslations("common.datePicker");
  const locale = useLocale();
  const textId = useId();
  const autoId = useId();
  const triggerId = id ?? `date-range-${autoId}`;
  const controlled = start !== undefined || end !== undefined;
  const [inner, setInner] = useState({ start: defaultStart ?? "", end: defaultEnd ?? "" });
  const cur = controlled ? { start: start ?? "", end: end ?? "" } : inner;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"sheet" | "dialog">("sheet");

  const s = isDateKey(cur.start) ? cur.start : "";
  const e = isDateKey(cur.end) ? cur.end : "";
  const label = s ? (e && e !== s ? t("rangeLabel", { start: formatValue(s, "date", locale), end: formatValue(e, "date", locale) }) : formatValue(s, "date", locale)) : "";

  function setRange(nextStart: string, nextEnd: string) {
    if (!controlled) setInner({ start: nextStart, end: nextEnd });
    onChange?.(nextStart, nextEnd);
  }

  function openPicker() {
    if (disabled) return;
    setKind(typeof window !== "undefined" && window.matchMedia?.(DESKTOP_QUERY).matches ? "dialog" : "sheet");
    setOpen(true);
  }

  const panel = open ? (
    <PickerPanel
      mode="range"
      value=""
      rangeStart={s}
      rangeEnd={e}
      onRange={(a, b, close) => {
        setRange(a, b);
        if (close) setOpen(false);
      }}
      min={min}
      max={max}
      required={required}
      minuteStep={5}
      onPick={() => {}}
      onDone={() => setOpen(false)}
    />
  ) : null;
  const dialogTitle = title ?? t("chooseRange");

  return (
    <span className={cn("relative block", className)}>
      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={[textId, describedBy].filter(Boolean).join(" ")}
        data-invalid={invalid || ariaInvalid === true || ariaInvalid === "true" || undefined}
        data-testid={testId}
        data-start={s}
        data-end={e}
        className={cn(fieldBase, triggerSizes[inputSize], "flex items-center justify-between gap-2 text-left data-invalid:border-danger")}
      >
        <span id={textId} className={cn("min-w-0 truncate tabular-nums", !label && "text-fg-subtle")}>
          {label || placeholder || t("rangePlaceholder")}
        </span>
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
      </button>
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={s}
          onChange={() => {}}
          onInvalid={() => document.getElementById(triggerId)?.focus()}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      ) : null}
      {startName ? <input type="hidden" name={startName} value={s} /> : null}
      {endName ? <input type="hidden" name={endName} value={e} /> : null}
      {kind === "dialog" ? (
        <Dialog open={open} onOpenChange={setOpen} title={dialogTitle} size="sm">
          {panel}
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen} title={dialogTitle}>
          {panel}
        </Sheet>
      )}
    </span>
  );
}
