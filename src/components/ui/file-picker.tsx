"use client";

import { FileText, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type Ref } from "react";
import { cn } from "@/lib/utils";

type FilePickerProps = {
  /** O <input type="file"> de verdade (escondido): quem usa lê `ref.current.files[0]` como antes. */
  ref?: Ref<HTMLInputElement>;
  accept?: string;
  disabled?: boolean;
  name?: string;
  /** id e aria-describedby vêm do FormField (o rótulo aponta para o input escondido; o botão tem o próprio nome). */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  onFileChange?: (file: File | null) => void;
  className?: string;
  "data-testid"?: string;
};

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Seletor de arquivo com botão próprio (no lugar do "Escolher arquivo" nativo, que no celular podia parar de abrir
 * depois de abrir e cancelar — pedido do responsável, 04/11). O botão chama o input escondido; mostra o arquivo
 * escolhido (nome e tamanho) com "Trocar" e "x" para remover. Para limpar depois de enviar, quem usa troca a `key`.
 */
export function FilePicker({ ref, accept, disabled, name, id, "aria-describedby": describedBy, "aria-invalid": invalid, onFileChange, className, "data-testid": testId }: FilePickerProps) {
  const t = useTranslations("common.filePicker");
  const inner = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const current = file;

  const pick = () => {
    if (disabled) return;
    inner.current?.click();
  };
  const clear = () => {
    if (inner.current) inner.current.value = "";
    setFile(null);
    onFileChange?.(null);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={(el) => {
          inner.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as { current: HTMLInputElement | null }).current = el;
        }}
        type="file"
        name={name}
        accept={accept}
        disabled={disabled}
        id={id}
        tabIndex={-1}
        className="sr-only"
        data-testid={testId}
        onChange={(e) => {
          // cancelar o seletor não muda nada; escolher troca o arquivo
          const f = e.target.files?.[0] ?? null;
          if (f) {
            setFile(f);
            onFileChange?.(f);
          }
        }}
      />
      {current ? (
        <div className="flex min-h-12 items-center gap-3 rounded-[var(--uh-field-radius)] border border-border bg-surface py-1.5 pr-1 pl-3" aria-live="polite">
          <FileText className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-fg" title={current.name}>
              <span className="sr-only">{t("selected", { name: "" })}</span>
              {current.name}
            </span>
            <span className="type-caption text-fg-muted">{size(current.size)}</span>
          </span>
          <button
            type="button"
            aria-describedby={describedBy}
            onClick={pick}
            disabled={disabled}
            className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-accent-text hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          >
            {t("change")}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={t("remove")}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-describedby={describedBy}
          onClick={pick}
          disabled={disabled}
          className={cn(
            "flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--uh-field-radius)] border border-dashed border-border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50",
            invalid && "border-danger",
          )}
        >
          <Paperclip className="size-4 text-fg-muted" aria-hidden="true" />
          {t("choose")}
        </button>
      )}
    </div>
  );
}
