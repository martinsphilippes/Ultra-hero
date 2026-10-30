import { useTranslations } from "next-intl";
import { CalendarDays, Check, Clock, Package, Repeat2, ShieldAlert, UserX } from "lucide-react";
import { rhythmChips, type ProgramConcept, type RhythmChip } from "@/lib/programs/concept";
import type { ConceptScreenKey } from "@/lib/programs/program-cards";

// Telas dos cards Conceito e Prepare-se: uma seção do conceito por tela (título fica no visualizador).

const RHYTHM_ICON = { weeks: CalendarDays, sessions: Repeat2, minutes: Clock } as const;

type ConceptProps = { screen: ConceptScreenKey; concept: ProgramConcept | null; description: string | null; estimatedWeeks: number | null };

/** Chave (em consume.program) do título de cada tela de conceito: os mesmos rótulos da seção antiga. */
export const CONCEPT_SCREEN_TITLE = {
  idea: "cards.idea",
  description: "about",
  for_who: "concept.forWho",
  outcomes: "concept.outcomes",
  method: "concept.method",
  rhythm: "concept.rhythm",
  needs: "concept.needs",
  care: "concept.care",
} as const satisfies Record<ConceptScreenKey, string>;

export function ConceptScreenBody({ screen, concept, description, estimatedWeeks }: ConceptProps) {
  const t = useTranslations("consume.program");
  const chipLabel = (chip: RhythmChip) => (chip.key === "weeks" ? t("weeks", { n: chip.n }) : t(`concept.${chip.key}`, { n: chip.n }));

  if (screen === "description") return <p className="type-body max-w-prose text-fg">{description}</p>;
  if (!concept) return null;

  switch (screen) {
    case "idea":
      return (
        <p className="max-w-prose text-lg leading-relaxed text-pretty text-fg" data-testid="program-concept-idea">
          {concept.idea}
        </p>
      );
    case "for_who":
      return (
        <div className="flex flex-col gap-3">
          <p className="type-body max-w-prose text-fg">{concept.for_who}</p>
          {concept.not_for ? (
            <p className="flex items-start gap-1.5 type-body-sm text-fg-muted">
              <UserX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">{t("concept.notFor")}:</span> {concept.not_for}
              </span>
            </p>
          ) : null}
        </div>
      );
    case "outcomes":
      return (
        <ul className="flex flex-col gap-3">
          {concept.outcomes.map((outcome) => (
            <li key={outcome} className="flex items-start gap-2.5 type-body text-fg">
              <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="size-4" strokeWidth={3} />
              </span>
              <span>{outcome}</span>
            </li>
          ))}
        </ul>
      );
    case "method":
      return (
        <ol className="flex flex-col gap-4">
          {concept.method.map((step, i) => (
            <li key={`${i}-${step.title}`} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent-text">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-semibold text-fg">{step.title}</span>
                <span className="type-body-sm text-fg-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      );
    case "rhythm": {
      const chips = rhythmChips(estimatedWeeks, concept);
      return (
        <div className="flex flex-col gap-3">
          {chips.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip) => {
                const Icon = RHYTHM_ICON[chip.key];
                return (
                  <li key={chip.key} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3.5 text-sm font-medium text-fg">
                    <Icon aria-hidden="true" className="size-4 text-fg-muted" />
                    {chipLabel(chip)}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {concept.rhythm.note ? <p className="type-body-sm text-fg-muted">{concept.rhythm.note}</p> : null}
        </div>
      );
    }
    case "needs":
      return concept.needs.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {concept.needs.map((need) => (
            <li key={need} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3.5 text-sm text-fg">
              <Package aria-hidden="true" className="size-4 text-fg-muted" />
              {need}
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body text-fg">{t("concept.needsNothing")}</p>
      );
    case "care":
      return (
        <div role="note" aria-label={t("concept.care")} className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          <p className="type-body text-fg">{concept.care}</p>
        </div>
      );
  }
}
