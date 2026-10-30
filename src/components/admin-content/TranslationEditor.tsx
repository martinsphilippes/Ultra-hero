"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveContentLocalizationAction, saveProgramLocalizationAction } from "@/app/admin/translations/actions";
import { Button, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { conceptToForm, formToConcept, type ConceptForm } from "@/lib/programs/concept";
import { ConceptFields } from "./ProgramConceptFields";

type Source = { title: string; summary: string | null; description?: string | null; body?: unknown; concept?: unknown };
type Existing = { title: string; summary: string | null; description?: string | null; body?: unknown; concept?: unknown; status: "draft" | "published"; updated_at: string } | null;

type Props = {
  kind: "content" | "program";
  targetId: string;
  locale: "pt-BR" | "en" | "es";
  localeLabel: string;
  sourceLocaleLabel: string;
  source: Source;
  existing: Existing;
  existingLabel: string | null;
  /** Programa: banco com a coluna concept (0048)? Sem ela, os campos de conceito somem. */
  conceptSupported?: boolean;
};

// Formulário de tradução por idioma com o original lado a lado (lado esquerdo só leitura).
export function TranslationEditor({ kind, targetId, locale, localeLabel, sourceLocaleLabel, source, existing, existingLabel, conceptSupported = false }: Props) {
  const t = useTranslations("adminContent.translations");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    summary: existing?.summary ?? "",
    description: existing?.description ?? "",
    body: existing?.body ? JSON.stringify(existing.body, null, 2) : "",
    status: existing?.status ?? ("draft" as "draft" | "published"),
  });
  const withConcept = kind === "program" && conceptSupported;
  const tconcept = useTranslations("adminContent.programs.concept");
  const [concept, setConcept] = useState<ConceptForm>(() => conceptToForm(existing?.concept ?? null));
  const [conceptInvalid, setConceptInvalid] = useState<string[]>([]);
  const sourceConcept = withConcept && source.concept ? conceptToForm(source.concept) : null;

  function validateJson(value: string) {
    if (!value.trim()) {
      setJsonError(null);
      return true;
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError(tc("jsonInvalid", { detail: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }

  function submit() {
    setError(null);
    if (kind === "content" && !validateJson(form.body)) return;
    // conceito traduzido: undefined = não mexe na coluna (banco sem a 0048)
    let conceptValue: ReturnType<typeof formToConcept> | null = null;
    if (withConcept) {
      conceptValue = formToConcept(concept);
      if (!conceptValue.ok) {
        setConceptInvalid(conceptValue.paths);
        setError(tconcept("invalid"));
        return;
      }
      setConceptInvalid([]);
    }
    const conceptPayload = conceptValue?.ok ? conceptValue.concept : undefined;
    startTransition(async () => {
      const result =
        kind === "content"
          ? await saveContentLocalizationAction(targetId, locale, { title: form.title, summary: form.summary, body: form.body, status: form.status })
          : await saveProgramLocalizationAction(targetId, locale, {
              title: form.title,
              summary: form.summary,
              description: form.description,
              status: form.status,
              ...(conceptPayload !== undefined ? { concept: conceptPayload } : {}),
            });
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  const sourceBody = source.body ? JSON.stringify(source.body, null, 2) : "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4 rounded-xl border border-border bg-surface p-4 lg:grid-cols-2"
      aria-label={t("target", { locale: localeLabel })}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">{t("source", { locale: sourceLocaleLabel })}</h3>
        <FormField label={t("sourceTitle")}>
          <Input value={source.title} readOnly />
        </FormField>
        <FormField label={t("sourceSummary")}>
          <Textarea value={source.summary ?? ""} readOnly rows={3} />
        </FormField>
        {kind === "program" ? (
          <>
            <FormField label={t("sourceDescription")}>
              <Textarea value={source.description ?? ""} readOnly rows={8} />
            </FormField>
            {withConcept ? (
              <section className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label={tconcept("sourceConcept")}>
                <h4 className="text-sm font-semibold text-fg">{tconcept("sourceConcept")}</h4>
                {sourceConcept ? (
                  <ConceptFields value={sourceConcept} onChange={() => undefined} readOnly idPrefix={`concept-src-${targetId}-${locale}`} />
                ) : (
                  <p className="type-caption text-fg-muted">{tconcept("noSourceConcept")}</p>
                )}
              </section>
            ) : null}
          </>
        ) : (
          <FormField label={t("sourceBody")}>
            <Textarea value={sourceBody} readOnly rows={12} className="font-mono text-xs" />
          </FormField>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">{t("target", { locale: localeLabel })}</h3>
        {existingLabel ? <p className="type-caption text-fg-muted">{existingLabel}</p> : <p className="type-caption text-fg-muted">{t("empty")}</p>}
        <FormField label={tc("title")} required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required />
        </FormField>
        <FormField label={tc("summary")}>
          <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} maxLength={600} />
        </FormField>
        {kind === "program" ? (
          <>
            <FormField label={tc("description")}>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={8} maxLength={4000} />
            </FormField>
            {withConcept ? (
              <section className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label={tconcept("title")}>
                <h4 className="text-sm font-semibold text-fg">{tconcept("title")}</h4>
                <p className="type-caption text-fg-muted">{tconcept("translationHint")}</p>
                <ConceptFields value={concept} onChange={setConcept} invalid={conceptInvalid} idPrefix={`concept-${targetId}-${locale}`} />
              </section>
            ) : null}
          </>
        ) : (
          <FormField label={t("bodyLabel")} hint={tc("jsonHint")} error={jsonError ?? undefined}>
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              onBlur={(e) => validateJson(e.target.value)}
              rows={12}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </FormField>
        )}
        <FormField label={t("statusLabel")}>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "draft" | "published" })}>
            <option value="draft">{t("draft")}</option>
            <option value="published">{t("published")}</option>
          </Select>
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" loading={pending}>
            {tc("save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
