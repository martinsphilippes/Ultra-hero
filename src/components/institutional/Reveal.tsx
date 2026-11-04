"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** De onde surge: de baixo, da esquerda, da direita ou crescendo. */
  from?: "up" | "left" | "right" | "zoom";
  /** Atraso em ms (cascata entre cartões). */
  delay?: number;
  as?: ElementType;
  className?: string;
};

// Mostra o conteúdo surgindo do invisível quando ele entra na tela (uma vez). Sem JS ou com "reduzir movimento",
// fica visível desde o início (o estado escondido só é aplicado no cliente, depois de montar).
export function Reveal({ children, from = "up", delay = 0, as: Tag = "div", className }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("shown");
      return;
    }
    // já visível na carga: anima do mesmo jeito (fica escondido um quadro e surge)
    setState("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={cn("uh-reveal", className)} data-state={state === "hidden" ? "hidden" : "shown"} data-from={from} style={{ "--uh-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}
