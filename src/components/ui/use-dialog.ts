"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type RefObject, type SyntheticEvent } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Options = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fechar ao clicar no backdrop (padrão: sim). */
  dismissible?: boolean;
};

// Comportamento compartilhado de Dialog e Sheet sobre <dialog> nativo:
// showModal/close, Escape, clique no backdrop, foco inicial, trap de Tab e retorno do foco.
export function useDialog({ open, onOpenChange, dismissible = true }: Options) {
  const ref: RefObject<HTMLDialogElement | null> = useRef<HTMLDialogElement>(null);
  const lastFocused = useRef<Element | null>(null);
  // Estado controlado mais recente, lido pelo "close" (que chega numa tarefa depois do dialog.close()).
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      lastFocused.current = document.activeElement;
      dialog.showModal();
      const target =
        dialog.querySelector<HTMLElement>("[data-autofocus]") ??
        dialog.querySelector<HTMLElement>(FOCUSABLE) ??
        dialog;
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Escape dispara "cancel"; evitamos o fechamento nativo para manter o estado controlado.
  const onCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (dismissible) onOpenChange(false);
    },
    [dismissible, onOpenChange],
  );

  const onClose = useCallback(() => {
    // Só avisa quando o <dialog> fechou sozinho (ex.: form method="dialog") com o estado ainda aberto. Se
    // o fechamento veio do próprio estado, o aviso repetido chegava depois e desfazia o que a tela fez no
    // intervalo (a foto de perfil perdia o erro do arquivo escolhido logo após "Cancelar").
    if (openRef.current) onOpenChange(false);
    const previous = lastFocused.current;
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }, [onOpenChange]);

  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (dismissible && event.target === event.currentTarget) onOpenChange(false);
    },
    [dismissible, onOpenChange],
  );

  // Trap de Tab (o <dialog> modal já torna o resto inerte; isto evita sair para o navegador).
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return { ref, onCancel, onClose, onBackdropClick, onKeyDown };
}
