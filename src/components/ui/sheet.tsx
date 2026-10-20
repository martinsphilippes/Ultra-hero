"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { useDialog } from "./use-dialog";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Lado em telas md+. No mobile é sempre um bottom sheet. */
  side?: "right" | "left";
  dismissible?: boolean;
  hideTitle?: boolean;
  className?: string;
};

// Painel deslizante: bottom sheet no mobile, lateral no desktop. Mesmo motor do Dialog.
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  dismissible = true,
  hideTitle = false,
  className,
}: SheetProps) {
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
        // mobile: bottom sheet
        "fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none max-h-[88dvh] rounded-t-2xl border border-border bg-surface p-0 text-fg shadow-lg",
        "open:animate-slide-up",
        // desktop: painel lateral
        "md:inset-y-0 md:bottom-0 md:h-dvh md:max-h-none md:w-[22rem] md:rounded-none md:border-y-0",
        side === "right" ? "md:left-auto md:right-0 md:border-r-0" : "md:left-0 md:right-auto md:border-l-0",
        className,
      )}
    >
      <div className="flex max-h-[88dvh] flex-col md:h-dvh md:max-h-none">
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong md:hidden" />
        <header className={cn("flex items-start justify-between gap-4 px-5 pt-4", hideTitle ? "pb-0" : "pb-3")}>
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
            <IconButton label={t("closeDialog")} icon={<X />} size="sm" onClick={() => onOpenChange(false)} className="-mr-2 -mt-1 shrink-0" />
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 safe-bottom">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4 safe-bottom">{footer}</footer>}
      </div>
    </dialog>
  );
}
