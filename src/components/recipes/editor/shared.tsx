"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui";
import type { RecipeDraft } from "@/lib/recipes/draft";
import { cn } from "@/lib/utils";

export type SetDraft = (updater: (d: RecipeDraft) => RecipeDraft) => void;

export type StepProps = {
  draft: RecipeDraft;
  setDraft: SetDraft;
  /** Mensagem traduzida do erro do campo (pelo caminho do payload), se houver. */
  errorFor: (path: string) => string | undefined;
  disabled: boolean;
  /** Anúncio para leitores de tela (reordenação, inclusão). */
  announce: (message: string) => void;
};

/** Botões ↑/↓/remover de um item de lista, com rótulos completos ("Subir Ingrediente 2: Ovo"). */
export function ItemControls({ index, total, label, onMove, onRemove, disabled }: { index: number; total: number; label: string; onMove: (to: number) => void; onRemove: () => void; disabled?: boolean }) {
  const t = useTranslations("recipes.editor.ingredients");
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton label={t("moveUp", { label })} icon={<ArrowUp />} disabled={disabled || index === 0} onClick={() => onMove(index - 1)} data-testid="move-up" />
      <IconButton label={t("moveDown", { label })} icon={<ArrowDown />} disabled={disabled || index === total - 1} onClick={() => onMove(index + 1)} data-testid="move-down" />
      <IconButton label={t("remove", { label })} icon={<X />} disabled={disabled} onClick={onRemove} />
    </div>
  );
}

/** Mensagem de erro de um campo, ligada pelo id (aria-describedby = `${id}-err`). */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-err`} role="alert" className="type-caption font-medium text-danger">
      {message}
    </p>
  );
}

export function StepSection({ title, children, className, id }: { title?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <fieldset id={id} tabIndex={id ? -1 : undefined} className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 outline-none sm:p-5", className)}>
      {title ? <legend className="px-1 text-base font-semibold text-fg">{title}</legend> : null}
      {children}
    </fieldset>
  );
}

/** Props de acessibilidade de um campo com possível erro. */
export function fieldA11y(id: string, error?: string) {
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-err` : undefined } as const;
}
