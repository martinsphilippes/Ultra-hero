import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CalendarDays, Check, Clock, Package, Repeat2, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { Card } from "@/components/ui";
import { conceptView, rhythmChips, type ProgramConcept, type RhythmChip } from "@/lib/programs/concept";

// "Conceito do programa": a parte conceitual na voz do próprio programa, logo abaixo do cabeçalho.
// Sem conceito, mostra a descrição antiga; sem nenhum dos dois, a seção some.

const RHYTHM_ICON = { weeks: CalendarDays, sessions: Repeat2, minutes: Clock } as const;

type Props = { concept: ProgramConcept | null; description: string | null; estimatedWeeks: number | null };

export function ProgramConcept({ concept, description, estimatedWeeks }: Props) {
  const t = useTranslations("consume.program");
  const view = conceptView(concept, description);
  if (view.kind === "empty") return null;

  return (
    <section aria-labelledby="program-concept" data-testid="program-concept" data-concept={view.kind} className="flex flex-col gap-5">
      <h2 id="program-concept" className="type-h2 text-fg">
        {t("concept.title")}
      </h2>
      {view.kind === "description" ? (
        <p className="type-body max-w-prose text-fg">{view.description}</p>
      ) : (
        <ConceptBody concept={view.concept} chips={rhythmChips(estimatedWeeks, view.concept)} />
      )}
    </section>
  );
}

function ConceptBody({ concept, chips }: { concept: ProgramConcept; chips: RhythmChip[] }) {
  const t = useTranslations("consume.program");
  const chipLabel = (chip: RhythmChip) => (chip.key === "weeks" ? t("weeks", { n: chip.n }) : t(`concept.${chip.key}`, { n: chip.n }));

  return (
    <>
      <p className="max-w-prose text-lg leading-relaxed text-pretty text-fg" data-testid="program-concept-idea">
        {concept.idea}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Block icon={<UserCheck />} title={t("concept.forWho")}>
          <p className="type-body-sm text-fg">{concept.for_who}</p>
          {concept.not_for ? (
            <p className="mt-2 flex items-start gap-1.5 type-body-sm text-fg-muted">
              <UserX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">{t("concept.notFor")}:</span> {concept.not_for}
              </span>
            </p>
          ) : null}
        </Block>

        <Block icon={<Check />} title={t("concept.outcomes")}>
          <ul className="flex flex-col gap-2">
            {concept.outcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-2 type-body-sm text-fg">
                <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <Block title={t("concept.method")}>
        <ol className="flex flex-col gap-3">
          {concept.method.map((step, i) => (
            <li key={`${i}-${step.title}`} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent-text">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{step.title}</span>
                <span className="type-body-sm text-fg-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Block>

      <div className="grid gap-3 sm:grid-cols-2">
        {chips.length > 0 || concept.rhythm.note ? (
          <Block title={t("concept.rhythm")}>
            {chips.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {chips.map((chip) => {
                  const Icon = RHYTHM_ICON[chip.key];
                  return (
                    <li key={chip.key} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 text-sm font-medium text-fg">
                      <Icon aria-hidden="true" className="size-4 text-fg-muted" />
                      {chipLabel(chip)}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {concept.rhythm.note ? <p className="mt-2 type-caption text-fg-muted">{concept.rhythm.note}</p> : null}
          </Block>
        ) : null}

        <Block icon={<Package />} title={t("concept.needs")}>
          {concept.needs.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {concept.needs.map((need) => (
                <li key={need} className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface-elevated px-3 text-sm text-fg">
                  {need}
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-body-sm text-fg">{t("concept.needsNothing")}</p>
          )}
        </Block>
      </div>

      <div role="note" aria-label={t("concept.care")} className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-fg">{t("concept.care")}</p>
          <p className="type-body-sm text-fg">{concept.care}</p>
        </div>
      </div>
    </>
  );
}

function Block({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card padding="md" className="gap-2.5">
      <h3 className="flex items-center gap-1.5 type-overline text-accent-text">
        {icon ? (
          <span aria-hidden="true" className="[&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        {title}
      </h3>
      {children}
    </Card>
  );
}
