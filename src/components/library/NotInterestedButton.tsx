"use client";

import { Ellipsis, EyeOff, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { setNotInterested } from "@/app/(app)/content/actions";
import { IconButton, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useActionError } from "./useCompletionFeedback";

type Props = { contentId: string; initial: boolean; className?: string };

// Menu "mais opções" com "Não tenho interesse" (alimenta as recomendações). Menu acessível:
// Escape fecha, setas movem, foco volta ao gatilho.
export function NotInterestedButton({ contentId, initial, className }: Props) {
  const t = useTranslations("consume.library");
  const { toast } = useToast();
  const errorMessage = useActionError();
  const [open, setOpen] = useState(false);
  // lado do menu: alinhado à direita do botão, a não ser que assim ele saia da tela pela esquerda
  const [align, setAlign] = useState<"left" | "right">("right");
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => firstItemRef.current?.focus());
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      firstItemRef.current?.focus();
    }
  }

  function toggleInterest() {
    const next = !value;
    startTransition(async () => {
      const result = await setNotInterested({ contentId, value: next });
      close();
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      setValue(next);
      toast({ title: next ? t("notInterestedDone") : t("interestRestored"), variant: "info" });
    });
  }

  return (
    <div ref={rootRef} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <IconButton
        ref={triggerRef}
        label={t("more")}
        icon={<Ellipsis />}
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!open) setAlign(menuSide(triggerRef.current));
          setOpen((v) => !v);
        }}
      />
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("more")}
          className={cn("absolute top-full z-30 mt-1 w-max min-w-56 max-w-[calc(100vw-2rem)]", align === "right" ? "right-0" : "left-0", " overflow-hidden rounded-xl border border-border bg-surface-elevated p-1 shadow-lg animate-slide-up")}
        >
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={toggleInterest}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus disabled:opacity-55"
          >
            {value ? <Undo2 className="size-4 text-fg-muted" aria-hidden="true" /> : <EyeOff className="size-4 text-fg-muted" aria-hidden="true" />}
            {value ? t("undo") : t("notInterested")}
          </button>
        </div>
      )}
    </div>
  );
}

// Largura mínima do menu (min-w-56) + margem: se, alinhado à direita do botão, ele passaria da borda
// esquerda da tela, abre alinhado à esquerda do botão.
const MENU_MIN_WIDTH = 224;
const EDGE = 8;
export function menuSide(trigger: HTMLElement | null): "left" | "right" {
  if (!trigger) return "right";
  const rect = trigger.getBoundingClientRect();
  return rect.right - MENU_MIN_WIDTH < EDGE ? "left" : "right";
}
