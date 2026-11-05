"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button, Checkbox, Dialog, FilePicker, FormField } from "@/components/ui";
import {
  TERMS_IMPORT_ACCEPT,
  TERMS_SUMMARY_MAX,
  cleanExtractedText,
  combineConditions,
  detectTermsByRules,
  prepareConditions,
  suggestionFound,
  termsImportFileIssue,
  termsImportKind,
  type TermsDetector,
  type TermsSuggestion,
} from "@/lib/deals/terms-import";

type Prepared = { file: File; text: string; moneyRemoved: number; truncated: boolean; suggestion: TermsSuggestion };
type Result = Prepared & { truncatedAfterCombine: boolean };

// Hoje só as regras de palavras (sem IA). Gancho: outro detector com a mesma assinatura entra aqui.
const detector: TermsDetector = async (text, segments) => detectTermsByRules(text, segments);

type Props = {
  /** Texto atual de "Condições" (para perguntar substituir/acrescentar). */
  summary: string;
  segments: { id: string; name: string }[];
  disabled?: boolean;
  /** Aplica o texto final e a sugestão no formulário (nada é salvo aqui). */
  onApply: (summary: string, suggestion: TermsSuggestion, file: File) => void;
  /** Guardar o PDF nos documentos do negócio ao salvar o rascunho (null = não dá para guardar aqui). */
  keepFile: boolean | null;
  onKeepFileChange: (keep: boolean) => void;
};

/**
 * "Preencher a partir de um documento" (05/11): lê PDF/DOCX/TXT no aparelho, põe o texto limpo em Condições (sem
 * valores, no limite do campo) e pré-marca os direitos de uso pelas regras de palavras. Mostra o que encontrou e
 * pede para conferir antes de salvar.
 */
export function TermsImport({ summary, segments, disabled = false, onApply, keepFile, onKeepFileChange }: Props) {
  const t = useTranslations("agency.terms.import");
  const tr = useTranslations("offer.rights");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Prepared | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  function apply(p: Prepared, mode: "replace" | "append") {
    const combined = combineConditions(summary, p.text, mode, TERMS_SUMMARY_MAX);
    onApply(combined.text, p.suggestion, p.file);
    setResult({ ...p, truncatedAfterCombine: combined.truncated });
    setChoice(null);
  }

  async function pick(file: File | null) {
    setError(null);
    setResult(null);
    if (!file) return;
    const issue = termsImportFileIssue(file);
    if (issue) return setError(t(`errors.${issue}`));
    setBusy(true);
    try {
      // a extração (pdfjs/mammoth) só carrega agora, sob demanda
      const { extractTermsText } = await import("@/lib/deals/terms-import-extract");
      const raw = await extractTermsText(file);
      const conditions = prepareConditions(raw, TERMS_SUMMARY_MAX);
      if (conditions.text.trim().length === 0) return setError(t("errors.no_text"));
      const suggestion = await detector(cleanExtractedText(raw), segments);
      const prepared: Prepared = { file, ...conditions, suggestion };
      if (summary.trim()) setChoice(prepared);
      else apply(prepared, "replace");
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : "read";
      setError(t(`errors.${["type", "protected", "no_text"].includes(code) ? code : "read"}`));
    } finally {
      setBusy(false);
    }
  }

  const found: string[] = [];
  if (result) {
    const s = result.suggestion;
    for (const c of s.channels) found.push(tr(`channels.${c}`));
    if (s.perpetual) found.push(t("foundPerpetual"));
    else if (s.usageMonths !== null) found.push(t("foundUsageMonths", { count: s.usageMonths }));
    if (s.boost) found.push(t("foundBoost"));
    if (s.exclusive) found.push(s.exclusivityMonths !== null ? t("foundExclusive", { count: s.exclusivityMonths }) : t("foundExclusiveNoTerm"));
    if (s.segmentIds.length > 0) found.push(t("foundSegments", { count: s.segmentIds.length }));
    if (s.category) found.push(t("foundCategory", { name: s.category }));
  }
  const isPdf = result ? termsImportKind(result.file.name, result.file.type) === "pdf" : false;

  return (
    <div className="flex flex-col gap-3" data-testid="terms-import">
      <Button
        type="button"
        variant="secondary"
        size="md"
        leadingIcon={<FileUp />}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        className="w-full sm:w-fit"
        data-testid="terms-import-open"
      >
        {t("open")}
      </Button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-hover/30 p-3">
          <FormField label={t("file")} hint={t("fileHint")}>
            <FilePicker key={pickerKey} accept={TERMS_IMPORT_ACCEPT} disabled={disabled || busy} onFileChange={(f) => void pick(f)} data-testid="terms-import-file" />
          </FormField>
          {busy ? (
            <p className="flex items-center gap-2 type-body-sm text-fg-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("reading")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="type-body-sm text-danger" data-testid="terms-import-error">
              {error}
            </p>
          ) : null}
          {result ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3" role="status" data-testid="terms-import-result">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                {t("found")}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                <li className="rounded-full bg-surface-hover px-2.5 py-1 type-caption text-fg">{t("foundText", { count: result.text.length })}</li>
                {found.map((f) => (
                  <li key={f} className="rounded-full bg-accent-soft px-2.5 py-1 type-caption text-fg">
                    {f}
                  </li>
                ))}
              </ul>
              {!suggestionFound(result.suggestion) ? <p className="type-caption text-fg-muted">{t("nothingFound")}</p> : null}
              {result.moneyRemoved > 0 ? (
                <p className="flex items-start gap-1.5 type-caption text-warning" data-testid="terms-import-money">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {t("moneyRemoved")}
                </p>
              ) : null}
              {result.truncated || result.truncatedAfterCombine ? (
                <p className="flex items-start gap-1.5 type-caption text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {t("truncated", { max: TERMS_SUMMARY_MAX })}
                </p>
              ) : null}
              <p className="flex items-start gap-1.5 type-body-sm font-medium text-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                {t("review")}
              </p>
              {keepFile !== null ? (
                isPdf ? (
                  <Checkbox label={t("keepFile")} description={t("keepFileHint")} checked={keepFile} onChange={(e) => onKeepFileChange(e.target.checked)} disabled={disabled} data-testid="terms-import-keep" />
                ) : (
                  <p className="type-caption text-fg-muted">{t("pdfOnly")}</p>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={choice !== null}
        onOpenChange={(o) => {
          if (!o) {
            setChoice(null);
            setPickerKey((k) => k + 1);
          }
        }}
        title={t("choiceTitle")}
        description={t("choiceHint")}
      >
        {/* três escolhas empilhadas e largas (no celular não cabem lado a lado) */}
        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" className="w-full" onClick={() => choice && apply(choice, "replace")} data-testid="terms-import-replace">
            {t("replace")}
          </Button>
          <Button type="button" size="lg" variant="secondary" className="w-full" onClick={() => choice && apply(choice, "append")} data-testid="terms-import-append">
            {t("append")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => (setChoice(null), setPickerKey((k) => k + 1))}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
