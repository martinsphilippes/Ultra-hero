"use client";

import { ArrowRight, Check, CheckCircle2, Clock, Flag, Hourglass } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { moveDealAction } from "@/app/agencia/negocios/actions";
import { Badge, Button, buttonBase, buttonSizes, buttonVariants, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { FLOW_STEPS, type FlowParty, type FlowStep, type NextStep } from "@/lib/deals/next-step";
import { localDay } from "@/lib/today/logic";
import { cn } from "@/lib/utils";

type Props = {
  party: FlowParty;
  step: NextStep;
  flow: FlowStep;
  href: string | null;
  /** negócio para a ação direta "Encerrar como ganha" (agência, gestor+) */
  dealId?: string;
  /** fuso para o dia do prazo */
  timeZone?: string;
  /** encerrada sem ganho: a barra some */
  cancelled?: boolean;
  /** id de teste da barra (a marca já tinha "campaign-steps") */
  stepsTestId?: string;
  /** nível do título (a oportunidade do herói já usa h2 no cabeçalho) */
  headingLevel?: "h2" | "h3";
};

// "Próximo passo" no topo das três telas (ficha do negócio, campanha da marca, oportunidade do herói): um botão grande
// quando é a vez de quem lê, uma espera calma dizendo por quem, e a barra do andamento com a fase atual destacada.
export function NextStepCard({ party, step, flow, href, dealId, timeZone = "America/Sao_Paulo", cancelled = false, stepsTestId = "next-step-steps", headingLevel = "h2" }: Props) {
  const Heading = headingLevel;
  const t = useTranslations("nextStep");
  const tk = useTranslations("commercial.deliverableKinds");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const p = step.params;
  const itemLabel = p.item || (p.kind ? (tk.has(p.kind) ? tk(p.kind) : p.kind) : "");
  const names = [p.brand ? t("theBrand") : null, ...(p.names ?? [])].filter(Boolean).join(", ");
  const values = { hero: p.hero ?? "", item: itemLabel, names, count: p.count ?? 0 };
  const prefix = step.mode === "action" ? `actions.${step.code}` : step.mode === "waiting" ? `waits.${step.code}` : `done.${step.code}`;
  const title = t(`${prefix}.title`, values);
  const hint = t.has(`${prefix}.hint`) ? t(`${prefix}.hint`, values) : step.mode === "waiting" ? t("waitHint") : null;
  const day = step.deadline ? (/^\d{4}-\d{2}-\d{2}$/.test(step.deadline) ? step.deadline : localDay(new Date(step.deadline), timeZone)) : null;
  const late = day ? day < localDay(new Date(), timeZone) : false;
  const current = FLOW_STEPS.indexOf(flow);
  const finishHere = party === "agency" && step.mode === "action" && step.code === "finishDeal" && dealId;
  const Icon = step.mode === "action" ? Flag : step.mode === "waiting" ? Hourglass : CheckCircle2;

  function finish() {
    if (!dealId) return;
    start(async () => {
      const result = await moveDealAction({ dealId, to: "closed", outcome: "won", note: "", force: false });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <section
      id="next-step"
      aria-labelledby="next-step-title"
      className={cn(
        "flex scroll-mt-20 flex-col gap-3 rounded-2xl border p-4 sm:p-5",
        step.mode === "action" ? "border-accent/50 bg-accent-soft/40" : step.mode === "done" ? "border-success/30 bg-success-soft/30" : "border-border bg-surface",
      )}
      data-testid="next-step"
      data-mode={step.mode}
      data-code={step.code}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn("size-5", step.mode === "action" ? "text-accent-text" : step.mode === "done" ? "text-success" : "text-fg-muted")} aria-hidden="true" />
        <Heading id="next-step-title" className="text-base font-semibold text-fg">
          {t("title")}
        </Heading>
        <Badge size="sm" variant={step.mode === "action" ? "accent" : step.mode === "done" ? "success" : "neutral"}>
          {t(`badge.${step.mode}`)}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold leading-snug text-fg" data-testid="next-step-title">
          {title}
        </p>
        {hint ? <p className="type-body-sm text-fg-muted">{hint}</p> : null}
        {day ? (
          <p className={cn("flex items-center gap-1.5 type-body-sm font-medium", late ? "text-danger" : "text-fg")}>
            <Clock className="size-4" aria-hidden="true" />
            {t(late ? "deadlineLate" : "deadline", { date: formatPlainDate(day, locale) })}
          </p>
        ) : null}
      </div>
      {finishHere ? (
        <Button type="button" size="lg" leadingIcon={<CheckCircle2 />} onClick={finish} loading={pending} className="w-full sm:w-fit" data-testid="next-step-finish">
          {t(`actions.${step.code}.cta`)}
        </Button>
      ) : href && (step.mode === "action" || step.target) ? (
        <Link
          href={href}
          className={cn(buttonBase, step.mode === "action" ? buttonVariants.primary : buttonVariants.secondary, step.mode === "action" ? buttonSizes.lg : buttonSizes.md, "w-full sm:w-fit")}
          data-testid="next-step-cta"
        >
          {t(`${prefix}.cta`)}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      {!cancelled ? (
        <ol className="flex flex-wrap gap-1.5 border-t border-border pt-3" aria-label={t("stepsLabel")} data-testid={stepsTestId}>
          {FLOW_STEPS.map((s, i) => {
            const passed = i < current || (flow === "done" && step.mode === "done");
            const here = i === current && !passed;
            return (
              <li
                key={s}
                aria-current={here ? "step" : undefined}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-0.5 type-caption",
                  here ? "border-accent bg-accent text-accent-fg font-semibold" : passed ? "border-accent/40 bg-accent-soft text-accent-text" : "border-border text-fg-muted",
                )}
              >
                {passed ? <Check className="size-3" aria-hidden="true" /> : null}
                {t(`steps.${s}`)}
                {passed ? <span className="sr-only"> · {t("stepDone")}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
