"use client";

import { AlertTriangle, Check, ChevronDown, ChevronUp, Info, Users, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge, Button, Checkbox, Dialog, FormField, MoneyInput, Select, Spinner, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatNumber, formatPlainDate } from "@/i18n/format";
import { applyCastAction, loadCastInputsAction } from "@/lib/casting/actions";
import {
  CAST_GOALS,
  evaluateCast,
  GOAL_WEIGHTS,
  MAX_CAST_SIZE,
  scoreHeroes,
  splitCastFees,
  suggestCasts,
  whyNoSuggestion,
  type CastGoal,
  type CastWeights,
  type HeroFlag,
  type HeroMetrics,
} from "@/lib/casting/mount";
import type { CastInputs } from "@/lib/casting/parse";
import { formatCents } from "@/lib/deals/schemas";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import { feeBudgetCents } from "@/lib/value-model/model";

type Props = {
  /** Negócio: "Usar este elenco" sugere os Heros no negócio (e o Adm grava a repartição). */
  dealId?: string;
  /** Proposta à chamada: "Usar este elenco" devolve os Heros ao formulário da proposta. */
  callId?: string;
  /** Heros que já estão no negócio/proposta (marcados ao abrir). */
  currentIds: string[];
  /** Na proposta: só podem entrar Heros liberados para marcas (consentimento + catálogo). */
  allowedIds?: string[];
  /** Valor total digitado na proposta (Adm), para simular sem sair da tela. */
  budgetCents?: number | null;
  /** Máximo de Heros do modelo (por Hero); o fixo não limita. */
  maxHeroes: number | null;
  onUse?: (ids: string[]) => void;
  /** Leitura dos dados (padrão: a ação do servidor); os testes de tela trocam por dados de exemplo. */
  loader?: typeof loadCastInputsAction;
};

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: CastInputs };

const WEIGHT_LEVELS = [0, 1, 2, 3] as const;
const WEIGHT_KEYS: Array<keyof CastWeights> = ["reach", "engagement", "fit", "response"];

/** Botão "Montar elenco" + diálogo (0096). */
export function CastBuilderButton(props: Props) {
  const t = useTranslations("valueModel.cast");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" leadingIcon={<Wand2 />} onClick={() => setOpen(true)} className="w-fit" data-testid="cast-open">
        {t("open")}
      </Button>
      {open ? <CastBuilderDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function CastBuilderDialog({ dealId, callId, currentIds, allowedIds, budgetCents, maxHeroes, onUse, onClose, loader = loadCastInputsAction }: Props & { onClose: () => void }) {
  const t = useTranslations("valueModel.cast");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [goal, setGoal] = useState<CastGoal>("mix");
  const [weights, setWeights] = useState<CastWeights>(GOAL_WEIGHTS.mix);
  const [showWeights, setShowWeights] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentIds);
  const [feeText, setFeeText] = useState<Record<string, string>>({});
  const [totalText, setTotalText] = useState(centsToBrl(budgetCents ?? null));
  const [manual, setManual] = useState<Record<string, number>>({});
  const [skipFees, setSkipFees] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    loader({ dealId: dealId ?? null, callId: callId ?? null }).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoad({ state: "error", message: r.error });
      setLoad({ state: "ready", data: r.data });
      setSelected((cur) => (cur.length > 0 ? cur : r.data.context.current));
      if (r.data.context.budgetCents !== null && r.data.context.kind === "deal") setTotalText(centsToBrl(r.data.context.budgetCents));
    });
    return () => {
      alive = false;
    };
  }, [dealId, callId, loader]);

  const data = load.state === "ready" ? load.data : null;
  const admin = data?.canValues ?? false;
  const ctx = data?.context ?? null;
  const limit = maxHeroes ?? (ctx?.valueModel === "por_heroi" ? ctx.maxHeroes : null);
  const totalCents = admin ? brlToCents(totalText) : null;
  // V = F + C: o orçamento de cachês é o valor total sem a comissão da agência
  const budget: number | null = !data || !ctx ? null : admin ? (totalCents && totalCents > 0 ? feeBudgetCents(totalCents, ctx.rateBp ?? 0) : null) : ctx.hasBudget ? 10_000 : null;
  const totalLocked = ctx?.kind === "deal" && ctx.budgetCents !== null;

  const heroes = useMemo(
    () =>
      (data?.heroes ?? []).map((h) => {
        const typed = brlToCents(feeText[h.talent_id] ?? "");
        return admin && h.fee_cents === null && typed !== null && typed > 0 ? { ...h, fee_cents: typed } : h;
      }),
    [data, admin, feeText],
  );
  const metrics = useMemo(() => (ctx ? scoreHeroes(heroes, ctx, weights) : []), [heroes, ctx, weights]);
  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const suggestions = useMemo(() => (budget ? suggestCasts(metrics, budget, { maxHeroes: limit }) : []), [metrics, budget, limit]);
  const totals = useMemo(() => evaluateCast(metrics, selected, budget ?? 0), [metrics, selected, budget]);

  const cost = (units: number) => (admin ? formatCents(units, locale) : `${Math.round(units / 100)}%`);
  const compact = (n: number) => formatNumber(n, locale, { notation: "compact" });
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

  function chooseGoal(next: CastGoal) {
    setGoal(next);
    setWeights(GOAL_WEIGHTS[next]);
  }
  function toggle(id: string, on: boolean) {
    setError(null);
    setSelected((cur) => (on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id)));
    if (!on) setManual((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== id)));
  }

  // repartição do valor entre o elenco (negócio, modelo fixo, Adm): proporcional ao cachê de referência; o que o Adm
  // edita fica; o resto se divide pelo que sobra, então a soma só não fecha se ele passar do orçamento
  const canSplit = Boolean(dealId && admin && ctx?.valueModel === "fixo" && budget);
  const fees = useMemo(() => {
    if (!canSplit || !budget) return [] as number[];
    const free = selected.filter((id) => manual[id] === undefined);
    const fixed = selected.reduce((s, id) => s + (manual[id] ?? 0), 0);
    const part = splitCastFees(Math.max(0, budget - fixed), free.map((id) => byId.get(id)?.cost ?? null));
    return selected.map((id) => (manual[id] !== undefined ? manual[id] : (part[free.indexOf(id)] ?? 0)));
  }, [canSplit, budget, selected, manual, byId]);
  const feeSum = fees.reduce((a, b) => a + b, 0);
  const feeDiff = (budget ?? 0) - feeSum;

  const outsideAllowed = callId && allowedIds ? selected.filter((id) => !allowedIds.includes(id)) : [];
  const overLimit = limit !== null && selected.length > limit;
  const needSplit = canSplit && !skipFees;
  const canUse = selected.length > 0 && !overLimit && outsideAllowed.length === 0 && (!needSplit || feeDiff === 0) && !pending;

  function use() {
    setError(null);
    if (callId) {
      onUse?.(selected);
      onClose();
      return;
    }
    if (!dealId) return;
    start(async () => {
      const r = await applyCastAction({ dealId, items: selected.map((id, i) => ({ talentId: id, feeCents: needSplit ? fees[i] : null })) });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      router.refresh();
      onClose();
    });
  }

  const flagText = (m: HeroMetrics, f: HeroFlag) => (f === "stale" && m.dataAsOf ? t("flags.staleOn", { date: formatPlainDate(m.dataAsOf, locale) }) : t(`flags.${f}`));
  const warnFlags: HeroFlag[] = ["no_data", "no_network", "no_fee", "blocked", "unavailable", "no_consent", "stale"];
  const ordered = [...metrics].sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.value - a.value || a.name.localeCompare(b.name));
  const shown = showAll ? ordered : ordered.slice(0, 8);
  const noData = metrics.filter((m) => m.flags.includes("no_data") || m.flags.includes("no_network"));
  const oldest = metrics.map((m) => m.dataAsOf).filter((d): d is string => !!d).sort()[0] ?? null;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t("title")}
      description={t("subtitle")}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2">
          {data && budget ? (
            <p className={`type-body-sm ${totals.overBudget ? "text-danger" : "text-fg"}`} role="status" data-testid="cast-live">
              {t("live", { count: totals.count, used: cost(totals.cost), pct: totals.usedPct })}
              {" · "}
              {totals.overBudget ? t("over", { value: cost(-totals.leftover) }) : t("leftover", { value: cost(totals.leftover) })}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" leadingIcon={<Check />} onClick={use} disabled={!canUse} loading={pending} data-testid="cast-use">
              {t("use")}
            </Button>
          </div>
        </div>
      }
    >
      {load.state === "loading" ? (
        <div className="flex items-center gap-2 py-6 text-fg-muted">
          <Spinner /> {t("loading")}
        </div>
      ) : load.state === "error" || !data || !ctx ? (
        <p role="alert" className="py-4 type-body-sm text-danger">
          {load.state === "error" ? load.message : t("loadError")}
        </p>
      ) : (
        <div className="flex flex-col gap-4 pb-3" data-testid="cast-builder">
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 type-caption text-fg" data-testid="cast-disclaimer">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              {t("disclaimer")}
              {oldest ? ` ${t("oldest", { date: formatPlainDate(oldest, locale) })}` : ""}
            </span>
          </p>

          {/* orçamento */}
          <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" aria-labelledby="cast-budget">
            <h3 id="cast-budget" className="text-sm font-semibold text-fg">
              {t("budget.title")}
            </h3>
            {admin ? (
              <>
                <FormField label={t("budget.total")} hint={totalLocked ? t("budget.totalLocked") : t("budget.totalHint")}>
                  <MoneyInput value={totalText} maxCents={10_000_000_000} onValueChange={(text) => setTotalText(text)} disabled={totalLocked} data-testid="cast-total" />
                </FormField>
                {budget && ctx.rateBp !== null ? (
                  <p className="type-caption text-fg-muted" data-testid="cast-fee-budget">
                    {t("budget.feeBudget", { value: formatCents(budget, locale), rate: formatNumber(ctx.rateBp / 100, locale, { maximumFractionDigits: 2 }) })}
                  </p>
                ) : (
                  <p className="type-caption text-warning">{t("budget.missing")}</p>
                )}
              </>
            ) : ctx.hasBudget ? (
              <p className="type-caption text-fg-muted">{t("budget.hiddenForManager")}</p>
            ) : (
              <p className="type-caption text-warning">{t("budget.missingManager")}</p>
            )}
            {limit !== null ? <p className="type-caption text-fg-muted">{t("budget.maxHeroes", { max: limit })}</p> : null}
          </section>

          {/* objetivo */}
          <section className="flex flex-col gap-2" aria-labelledby="cast-goal">
            <h3 id="cast-goal" className="text-sm font-semibold text-fg">
              {t("goal.title")}
            </h3>
            <div role="radiogroup" aria-labelledby="cast-goal" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CAST_GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={goal === g}
                  onClick={() => chooseGoal(g)}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${goal === g ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:text-fg"}`}
                  data-testid={`cast-goal-${g}`}
                >
                  {t(`goal.${g}`)}
                </button>
              ))}
            </div>
            <p className="type-caption text-fg-muted">{t(`goal.hint.${goal}`)}</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowWeights((x) => !x)} aria-expanded={showWeights} leadingIcon={showWeights ? <ChevronUp /> : <ChevronDown />} className="w-fit">
              {t("weights.toggle")}
            </Button>
            {showWeights ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3" data-testid="cast-weights">
                {WEIGHT_KEYS.map((k) => (
                  <FormField key={k} label={t(`weights.${k}`)}>
                    <Select value={String(weights[k])} onChange={(e) => setWeights((cur) => ({ ...cur, [k]: Number(e.target.value) }))}>
                      {WEIGHT_LEVELS.map((w) => (
                        <option key={w} value={w}>
                          {t(`weights.level.${w}`)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ))}
                <p className="col-span-2 type-caption text-fg-muted">{t("weights.hint")}</p>
              </div>
            ) : null}
          </section>

          {/* combinações */}
          <section className="flex flex-col gap-2" aria-labelledby="cast-suggestions">
            <h3 id="cast-suggestions" className="text-sm font-semibold text-fg">
              {t("suggestions.title")}
            </h3>
            {!budget ? (
              <p className="type-body-sm text-fg-muted">{t("suggestions.needBudget")}</p>
            ) : suggestions.length === 0 ? (
              <p className="type-body-sm text-warning" data-testid="cast-none">
                {t(`suggestions.none.${whyNoSuggestion(metrics, budget)}`)}
              </p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-3">
                {suggestions.map((s) => {
                  const on = s.totals.ids.length === selected.length && s.totals.ids.every((id) => selected.includes(id));
                  return (
                    <li key={s.strategy} className={`flex flex-col gap-2 rounded-2xl border p-3 ${on ? "border-accent bg-accent-soft/40" : "border-border bg-surface"}`} data-testid="cast-suggestion" data-strategy={s.strategy}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-fg">{t(`strategy.${s.strategy}`)}</span>
                        <Badge size="sm" variant="neutral" icon={<Users />}>
                          {s.totals.count}
                        </Badge>
                      </div>
                      <p className="type-caption text-fg">{s.totals.ids.map((id) => byId.get(id)?.name ?? "").join(", ")}</p>
                      <dl className="grid grid-cols-2 gap-2 type-body-sm">
                        <Metric label={t("m.reach")} value={`~${compact(s.totals.reach)}`} />
                        <Metric label={admin ? t("m.cpm") : t("m.reachPerPct")} value={admin ? (s.totals.costPerThousand !== null ? formatCents(Math.round(s.totals.costPerThousand), locale) : "—") : s.totals.cost > 0 ? compact(Math.round(s.totals.reach / (s.totals.cost / 100))) : "—"} />
                        <Metric label={t("m.leftover")} value={`${cost(s.totals.leftover)}`} />
                        <Metric label={t("m.fit")} value={pct(s.totals.fit)} />
                      </dl>
                      <div className="flex flex-col gap-0.5">
                        <span className="type-caption font-medium text-fg-muted">{t("why")}</span>
                        <ul className="list-disc pl-4 type-caption text-fg">
                          {s.reasons.map((r) => (
                            <li key={r.code}>{t(`reason.${r.code}`, (r.params ?? {}) as Record<string, string | number>)}</li>
                          ))}
                        </ul>
                      </div>
                      <Button type="button" size="sm" variant={on ? "secondary" : "primary"} onClick={() => setSelected(s.totals.ids)} data-testid={`cast-pick-${s.strategy}`}>
                        {on ? t("picked") : t("pick")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ajuste manual */}
          <section className="flex flex-col gap-2" aria-labelledby="cast-manual">
            <h3 id="cast-manual" className="text-sm font-semibold text-fg">
              {t("manual.title", { count: metrics.length })}
            </h3>
            {noData.length > 0 ? (
              <p className="flex items-start gap-2 type-caption text-warning" data-testid="cast-nodata">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("manual.noData", { count: noData.length })}
              </p>
            ) : null}
            <ul className="flex flex-col gap-2" data-testid="cast-heroes">
              {shown.map((m) => {
                const h = data.heroes.find((x) => x.talent_id === m.id);
                const on = selected.includes(m.id);
                const outside = callId && allowedIds ? !allowedIds.includes(m.id) : false;
                return (
                  <li key={m.id} className={`flex flex-col gap-2 rounded-xl border p-3 ${on ? "border-accent/40 bg-accent-soft/40" : "border-border"}`} data-testid="cast-hero">
                    <Checkbox label={m.name} checked={on} onChange={(e) => toggle(m.id, e.target.checked)} />
                    <p className="type-caption text-fg-muted">
                      {m.reach > 0 ? t("manual.line", { reach: compact(m.reach), fit: pct(m.fit), cost: m.cost !== null ? cost(m.cost) : "—" }) : t("manual.lineNoData")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.flags
                        .filter((f) => warnFlags.includes(f) || (f === "followers_estimate") || f === "views_estimate" || f === "limited")
                        .map((f) => (
                          <Badge key={f} size="sm" variant={warnFlags.includes(f) ? "warning" : "neutral"}>
                            {flagText(m, f)}
                          </Badge>
                        ))}
                      {h?.fee_source ? (
                        <Badge size="sm" variant="neutral">
                          {t(`feeSource.${h.fee_source}`)}
                        </Badge>
                      ) : null}
                      {outside && on ? (
                        <Badge size="sm" variant="danger">
                          {t("manual.notReleased")}
                        </Badge>
                      ) : null}
                    </div>
                    {admin && h && h.fee_cents === null ? (
                      <FormField label={t("manual.simFee")} hint={t("manual.simFeeHint")}>
                        <MoneyInput value={feeText[m.id] ?? ""} maxCents={10_000_000_000} onValueChange={(text) => setFeeText((cur) => ({ ...cur, [m.id]: text }))} />
                      </FormField>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {ordered.length > 8 ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAll((x) => !x)} className="w-fit">
                {showAll ? t("manual.fewer") : t("manual.more", { count: ordered.length - 8 })}
              </Button>
            ) : null}
            {overLimit ? <p className="type-caption text-danger">{t("manual.overLimit", { max: limit ?? MAX_CAST_SIZE })}</p> : null}
            {outsideAllowed.length > 0 ? <p className="type-caption text-danger">{t("manual.outsideAllowed")}</p> : null}
            {totals.missingFee.length > 0 ? <p className="type-caption text-warning">{t("manual.missingFee", { names: totals.missingFee.join(", ") })}</p> : null}
          </section>

          {/* repartição do valor */}
          {canSplit && selected.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" aria-labelledby="cast-split" data-testid="cast-split">
              <h3 id="cast-split" className="text-sm font-semibold text-fg">
                {t("split.title")}
              </h3>
              <p className="type-caption text-fg-muted">{t("split.hint")}</p>
              <Checkbox label={t("split.skip")} checked={skipFees} onChange={(e) => setSkipFees(e.target.checked)} />
              {!skipFees ? (
                <>
                  <ul className="flex flex-col gap-2">
                    {selected.map((id, i) => (
                      <li key={id} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                        <span className="truncate text-sm text-fg">{byId.get(id)?.name ?? ""}</span>
                        <MoneyInput
                          aria-label={t("split.feeOf", { name: byId.get(id)?.name ?? "" })}
                          value={centsToBrl(fees[i] ?? 0)}
                          maxCents={10_000_000_000}
                          onValueChange={(_text, cents) => setManual((cur) => ({ ...cur, [id]: cents ?? 0 }))}
                          data-testid={`cast-fee-${i}`}
                        />
                      </li>
                    ))}
                  </ul>
                  <p className={`type-body-sm ${feeDiff === 0 ? "text-success" : "text-danger"}`} role="status" data-testid="cast-split-sum">
                    {feeDiff === 0 ? t("split.exact", { value: formatCents(feeSum, locale) }) : feeDiff > 0 ? t("split.missing", { value: formatCents(feeDiff, locale) }) : t("split.excess", { value: formatCents(-feeDiff, locale) })}
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setManual({})} className="w-fit">
                    {t("split.reset")}
                  </Button>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="type-caption text-fg-muted">{label}</dt>
      <dd className="font-semibold text-fg">{value}</dd>
    </div>
  );
}
