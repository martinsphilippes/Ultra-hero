"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveVersionConceptAction } from "@/app/admin/programs/actions";
import { Button, FormField, IconButton, Input, Textarea, useToast } from "@/components/ui";
import { CONCEPT_LIMITS as L, conceptToForm, formToConcept, type ConceptForm } from "@/lib/programs/concept";

// Campos do conceito do programa (versão e tradução). Controlado: quem usa guarda o estado e salva.

type FieldsProps = {
  value: ConceptForm;
  onChange: (next: ConceptForm) => void;
  /** Caminhos inválidos devolvidos por formToConcept (ex.: "outcomes.1", "method"). */
  invalid?: string[];
  readOnly?: boolean;
  idPrefix: string;
};

function hasError(invalid: string[] | undefined, path: string): boolean {
  return Boolean(invalid?.some((p) => p === path || p.startsWith(`${path}.`)));
}

export function ConceptFields({ value, onChange, invalid, readOnly = false, idPrefix }: FieldsProps) {
  const t = useTranslations("adminContent.programs.concept");
  const set = (patch: Partial<ConceptForm>) => onChange({ ...value, ...patch });
  const err = (path: string, hint: string) => (hasError(invalid, path) ? hint : undefined);

  const ideaHint = t("ideaHint", { min: L.idea.min, max: L.idea.max });
  const forWhoHint = t("forWhoHint", { max: L.forWho.max });
  const notForHint = t("notForHint", { max: L.notFor.max });
  const outcomesHint = t("outcomesHint", { min: L.outcomes.min, max: L.outcomes.max });
  const methodHint = t("methodHint", { min: L.method.min, max: L.method.max });
  const needsHint = t("needsHint", { max: L.needs.max });
  const careHint = t("careHint", { min: L.care.min, max: L.care.max });
  const rhythmHint = t("rhythmHint");

  return (
    <div className="grid gap-4">
      <FormField id={`${idPrefix}-idea`} label={t("idea")} hint={ideaHint} error={err("idea", ideaHint)}>
        <Textarea value={value.idea} onChange={(e) => set({ idea: e.target.value })} rows={4} maxLength={L.idea.max} readOnly={readOnly} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-for-who`} label={t("forWho")} hint={forWhoHint} error={err("for_who", forWhoHint)}>
          <Textarea value={value.for_who} onChange={(e) => set({ for_who: e.target.value })} rows={3} maxLength={L.forWho.max} readOnly={readOnly} />
        </FormField>
        <FormField id={`${idPrefix}-not-for`} label={t("notFor")} hint={notForHint} error={err("not_for", notForHint)}>
          <Textarea value={value.not_for} onChange={(e) => set({ not_for: e.target.value })} rows={3} maxLength={L.notFor.max} readOnly={readOnly} />
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("outcomes")}</legend>
        <p className={hasError(invalid, "outcomes") ? "type-caption font-medium text-danger" : "type-caption text-fg-muted"}>{outcomesHint}</p>
        {value.outcomes.map((outcome, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={t("outcomeN", { n: i + 1 })}
              aria-invalid={hasError(invalid, `outcomes.${i}`) || undefined}
              value={outcome}
              onChange={(e) => set({ outcomes: value.outcomes.map((o, j) => (j === i ? e.target.value : o)) })}
              maxLength={L.outcomes.itemMax}
              readOnly={readOnly}
              className="flex-1"
            />
            {!readOnly && (
              <IconButton
                label={t("remove", { label: t("outcomeN", { n: i + 1 }) })}
                icon={<Trash2 />}
                size="sm"
                onClick={() => set({ outcomes: value.outcomes.filter((_, j) => j !== i) })}
              />
            )}
          </div>
        ))}
        {!readOnly && value.outcomes.length < L.outcomes.max && (
          <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} className="w-fit" onClick={() => set({ outcomes: [...value.outcomes, ""] })}>
            {t("addOutcome")}
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("method")}</legend>
        <p className={hasError(invalid, "method") ? "type-caption font-medium text-danger" : "type-caption text-fg-muted"}>{methodHint}</p>
        <ol className="flex flex-col gap-3">
          {value.method.map((step, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-border p-2">
              <span aria-hidden="true" className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent-text">
                {i + 1}
              </span>
              <div className="grid flex-1 gap-2">
                <Input
                  aria-label={t("stepTitle", { n: i + 1 })}
                  aria-invalid={hasError(invalid, `method.${i}.title`) || undefined}
                  placeholder={t("stepTitle", { n: i + 1 })}
                  value={step.title}
                  onChange={(e) => set({ method: value.method.map((m, j) => (j === i ? { ...m, title: e.target.value } : m)) })}
                  maxLength={L.method.titleMax}
                  readOnly={readOnly}
                  inputSize="sm"
                />
                <Textarea
                  aria-label={t("stepText", { n: i + 1 })}
                  aria-invalid={hasError(invalid, `method.${i}.text`) || undefined}
                  placeholder={t("stepText", { n: i + 1 })}
                  value={step.text}
                  onChange={(e) => set({ method: value.method.map((m, j) => (j === i ? { ...m, text: e.target.value } : m)) })}
                  maxLength={L.method.textMax}
                  readOnly={readOnly}
                  rows={2}
                />
              </div>
              {!readOnly && (
                <IconButton label={t("remove", { label: t("stepTitle", { n: i + 1 }) })} icon={<Trash2 />} size="sm" onClick={() => set({ method: value.method.filter((_, j) => j !== i) })} />
              )}
            </li>
          ))}
        </ol>
        {!readOnly && value.method.length < L.method.max && (
          <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} className="w-fit" onClick={() => set({ method: [...value.method, { title: "", text: "" }] })}>
            {t("addStep")}
          </Button>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("rhythm")}</legend>
        <FormField id={`${idPrefix}-sessions`} label={t("sessionsPerWeek")} error={err("rhythm.sessions_per_week", t("rangeHint", { min: L.sessionsPerWeek.min, max: L.sessionsPerWeek.max }))}>
          <Input type="number" min={L.sessionsPerWeek.min} max={L.sessionsPerWeek.max} value={value.sessions_per_week} onChange={(e) => set({ sessions_per_week: e.target.value })} readOnly={readOnly} inputSize="sm" />
        </FormField>
        <FormField id={`${idPrefix}-minutes`} label={t("minutesPerDay")} error={err("rhythm.minutes_per_day", t("rangeHint", { min: L.minutesPerDay.min, max: L.minutesPerDay.max }))}>
          <Input type="number" min={L.minutesPerDay.min} max={L.minutesPerDay.max} value={value.minutes_per_day} onChange={(e) => set({ minutes_per_day: e.target.value })} readOnly={readOnly} inputSize="sm" />
        </FormField>
        <FormField id={`${idPrefix}-rhythm-note`} label={t("rhythmNote")} hint={rhythmHint} error={err("rhythm.note", rhythmHint)} className="sm:col-span-2">
          <Input value={value.rhythm_note} onChange={(e) => set({ rhythm_note: e.target.value })} maxLength={L.rhythmNote.max} readOnly={readOnly} inputSize="sm" />
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("needs")}</legend>
        <p className={hasError(invalid, "needs") ? "type-caption font-medium text-danger" : "type-caption text-fg-muted"}>{needsHint}</p>
        {value.needs.map((need, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={t("needN", { n: i + 1 })}
              aria-invalid={hasError(invalid, `needs.${i}`) || undefined}
              value={need}
              onChange={(e) => set({ needs: value.needs.map((n, j) => (j === i ? e.target.value : n)) })}
              maxLength={L.needs.itemMax}
              readOnly={readOnly}
              inputSize="sm"
              className="flex-1"
            />
            {!readOnly && <IconButton label={t("remove", { label: t("needN", { n: i + 1 }) })} icon={<Trash2 />} size="sm" onClick={() => set({ needs: value.needs.filter((_, j) => j !== i) })} />}
          </div>
        ))}
        {!readOnly && value.needs.length < L.needs.max && (
          <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} className="w-fit" onClick={() => set({ needs: [...value.needs, ""] })}>
            {t("addNeed")}
          </Button>
        )}
      </fieldset>

      <FormField id={`${idPrefix}-care`} label={t("care")} hint={careHint} error={err("care", careHint)}>
        <Textarea value={value.care} onChange={(e) => set({ care: e.target.value })} rows={3} maxLength={L.care.max} readOnly={readOnly} />
      </FormField>
    </div>
  );
}

// ---------------------------------------------------------------- formulário da versão
export function ProgramConceptForm({ programId, versionId, initial }: { programId: string; versionId: string; initial: unknown }) {
  const t = useTranslations("adminContent.programs.concept");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ConceptForm>(() => conceptToForm(initial));
  const [invalid, setInvalid] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const result = formToConcept(form);
    if (!result.ok) {
      setInvalid(result.paths);
      setError(t("invalid"));
      return;
    }
    setInvalid([]);
    startTransition(async () => {
      const saved = await saveVersionConceptAction(programId, versionId, result.concept);
      if (saved.ok) {
        toast({ title: saved.message ?? t("saved"), variant: "success" });
        router.refresh();
      } else setError(saved.error);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
      aria-label={t("title")}
    >
      <ConceptFields value={form} onChange={setForm} invalid={invalid} idPrefix={`concept-${versionId}`} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
