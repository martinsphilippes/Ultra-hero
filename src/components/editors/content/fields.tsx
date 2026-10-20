"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, FormField, IconButton, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "./schema";

// Widgets compartilhados pelos sub-editores do ContentForm. Todos controlados e
// desabilitáveis (o formulário envolve tudo num <fieldset disabled>).

/** Traduz a chave de validação vinda do Zod ("required", "tooLong"…) para o idioma da UI. */
export function useValidationMessage() {
  const t = useTranslations("editors.validation");
  return (key?: string | null): string | undefined => {
    if (!key) return undefined;
    return t.has(key) ? t(key) : t("invalid");
  };
}

type NumberFieldProps = {
  label: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  hint?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  className?: string;
};

// Campo numérico inteiro: vazio => null (o servidor interpreta como "não informado").
export function NumberField({ label, value, onChange, error, hint, min, max, step = 1, required, className }: NumberFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
      />
    </FormField>
  );
}

type ListEditorProps = {
  label: ReactNode;
  hint?: ReactNode;
  items: string[];
  onChange: (items: string[]) => void;
  /** Prefixo dos erros ("body.steps") para localizar "body.steps.2". */
  errorPrefix: string;
  errors: FieldErrors;
  placeholder?: string;
  multiline?: boolean;
  max?: number;
  /** Rótulo acessível de cada item: "Passo {n}". */
  itemLabel: (n: number) => string;
};

// Lista ordenada de textos (passos, pontos-chave…) com adicionar/remover.
export function ListEditor({ label, hint, items, onChange, errorPrefix, errors, placeholder, multiline = false, max = 50, itemLabel }: ListEditorProps) {
  const t = useTranslations("editors.list");
  const tv = useValidationMessage();
  const baseId = useId();
  const listError = tv(errors[errorPrefix]);

  function update(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${baseId}-label`}>
      <span id={`${baseId}-label`} className="text-sm font-semibold text-fg">
        {label}
      </span>
      {hint && <p className="type-caption text-fg-muted">{hint}</p>}
      {items.length === 0 && <p className="type-caption text-fg-subtle">{t("empty")}</p>}
      <ol className="flex flex-col gap-2">
        {items.map((item, index) => {
          const error = tv(errors[`${errorPrefix}.${index}`]);
          const id = `${baseId}-${index}`;
          return (
            <li key={index} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-3 w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-fg-muted">
                {index + 1}.
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {multiline ? (
                  <Textarea id={id} aria-label={itemLabel(index + 1)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} rows={2} value={item} placeholder={placeholder} onChange={(e) => update(index, e.target.value)} />
                ) : (
                  <Input id={id} aria-label={itemLabel(index + 1)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} value={item} placeholder={placeholder} onChange={(e) => update(index, e.target.value)} />
                )}
                {error && (
                  <p id={`${id}-err`} role="alert" className="type-caption font-medium text-danger">
                    {error}
                  </p>
                )}
              </div>
              <IconButton label={t("remove", { label: itemLabel(index + 1) })} icon={<X />} onClick={() => remove(index)} className="shrink-0" />
            </li>
          );
        })}
      </ol>
      {listError && (
        <p role="alert" className="type-caption font-medium text-danger">
          {listError}
        </p>
      )}
      <div>
        <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} disabled={items.length >= max} onClick={() => onChange([...items, ""])}>
          {t("add")}
        </Button>
      </div>
    </div>
  );
}

type ChipInputProps = {
  label: ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  /** Sugestões clicáveis (ex.: alérgenos comuns). */
  suggestions?: string[];
};

// Entrada de "chips": Enter ou vírgula adiciona; cada chip tem botão de remover (44px).
export function ChipInput({ label, values, onChange, hint, error, placeholder, max = 12, maxLength = 30, suggestions = [] }: ChipInputProps) {
  const t = useTranslations("editors.chips");
  const [draft, setDraft] = useState("");
  const baseId = useId();

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().slice(0, maxLength))
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = Array.from(new Set([...values, ...parts])).slice(0, max);
    onChange(next);
    setDraft("");
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }
  const remaining = suggestions.filter((s) => !values.includes(s));
  const full = values.length >= max;

  return (
    <div className="flex flex-col gap-2">
      <FormField label={label} hint={hint ?? t("hint")} error={error}>
        <Input
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          aria-describedby={values.length > 0 ? `${baseId}-list` : undefined}
        />
      </FormField>
      {values.length > 0 && (
        <ul id={`${baseId}-list`} aria-label={t("selected")} className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value} className="inline-flex items-center gap-0.5 rounded-full border border-border-strong bg-surface-elevated pl-3 text-sm text-fg">
              <span className="py-2">{value}</span>
              <IconButton label={t("remove", { value })} icon={<X />} size="md" className="-mr-1 rounded-full" onClick={() => onChange(values.filter((v) => v !== value))} />
            </li>
          ))}
        </ul>
      )}
      {remaining.length > 0 && !full && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("suggestions")}>
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border border-dashed border-border-strong px-3 text-xs font-medium text-fg-muted",
                "hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Moldura de seção do formulário (fieldset acessível com legenda).
export function FormSection({ legend, description, children, className }: { legend: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5", className)}>
      <legend className="px-1 text-base font-semibold text-fg">{legend}</legend>
      {description && <p className="-mt-2 type-body-sm text-fg-muted">{description}</p>}
      {children}
    </fieldset>
  );
}
