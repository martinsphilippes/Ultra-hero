"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { useDialog } from "./use-dialog";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Rodapé com ações (botões). */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Permite fechar por Escape/backdrop (padrão: sim). */
  dismissible?: boolean;
  /** Esconde o título visualmente (continua acessível). */
  hideTitle?: boolean;
  className?: string;
};

const sizes = { sm: "md:max-w-sm", md: "md:max-w-lg", lg: "md:max-w-2xl" };

// Modal centralizado sobre <dialog> nativo: foco preso, Escape, backdrop, foco devolvido.
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  hideTitle = false,
  className,
}: DialogProps) {
  const t = useTranslations("common.a11y");
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const { ref, onCancel, onClose, onBackdropClick, onKeyDown } = useDialog({ open, onOpenChange, dismissible });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={onCancel}
      onClose={onClose}
      onClick={onBackdropClick}
      onKeyDown={onKeyDown}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-none rounded-2xl border border-border bg-surface p-0 text-fg shadow-lg",
        "max-h-[calc(100dvh-2rem)] overflow-hidden",
        "open:animate-slide-up",
        sizes[size],
        className,
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className={cn("flex items-start justify-between gap-4 px-5 pt-5", hideTitle ? "pb-0" : "pb-3")}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className={cn("type-h3 text-fg", hideTitle && "sr-only")}>
              {title}
            </h2>
            {description && (
              <p id={descId} className="type-body-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton label={t("closeDialog")} icon={<X />} size="sm" onClick={() => onOpenChange(false)} className="-mr-2 -mt-2 shrink-0" />
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}
