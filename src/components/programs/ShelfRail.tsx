"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  /** Cabeçalho da prateleira (eyebrow, título, meta), renderizado no servidor. */
  header: ReactNode;
  /** Ação principal (Ver programa / Continuar). */
  action?: ReactNode;
  /** Nome da lista para leitor de tela ("Etapas de {programa}"). */
  listLabel: string;
  previousLabel: string;
  nextLabel: string;
  children: ReactNode;
  className?: string;
};

// Trilho horizontal de uma prateleira: rolagem por toque com snap no celular (sangra até a borda,
// primeiro quadrado alinhado à margem) e, no desktop, setas ‹ › desabilitadas nas pontas.
// Teclado: os quadrados são links; o foco rola o item para a vista (scroll-padding nas margens).
export function ShelfRail({ header, action, listLabel, previousLabel, nextLabel, children, className }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 1px de folga: zoom e frações de pixel deixam o fim em 0,5px.
    setEdges({ start: el.scrollLeft <= 1, end: max <= 1 || el.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [update]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Avança quase uma tela: o último quadrado parcialmente visível vira o primeiro.
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.85, 120), behavior: reduce ? "auto" : "smooth" });
  };

  // O navegador só rola o foco para a vista quando o item está todo escondido; o 4º quadrado, meio
  // visível, ficaria cortado. Aqui o quadrado focado entra inteiro (respeitando o scroll-padding).
  const revealFocused = (event: FocusEvent<HTMLOListElement>) => {
    const rail = ref.current;
    const target = event.target as HTMLElement;
    if (!rail || target === rail) return;
    const item = target.closest("li") ?? target;
    const railBox = rail.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left >= railBox.left - 1 && box.right <= railBox.right + 1) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    item.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <div className="hidden items-center gap-1 md:flex">
            <IconButton label={previousLabel} icon={<ChevronLeft />} variant="ghost" disabled={edges.start} onClick={() => scrollByPage(-1)} data-shelf-prev="" />
            <IconButton label={nextLabel} icon={<ChevronRight />} variant="ghost" disabled={edges.end} onClick={() => scrollByPage(1)} data-shelf-next="" />
          </div>
        </div>
      </div>
      <ol
        ref={ref}
        aria-label={listLabel}
        data-testid="shelf-rail"
        onFocus={revealFocused}
        className={cn(
          // Celular: sangra até a borda (-mx-gutter) com o 1º quadrado na margem (px-gutter) e a ponta do 4º à vista.
          "-mx-gutter flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-smooth px-gutter py-1 scroll-px-gutter scrollbar-none",
          "motion-reduce:scroll-auto md:mx-0 md:gap-3 md:px-0 md:scroll-px-0",
        )}
      >
        {children}
      </ol>
    </div>
  );
}
