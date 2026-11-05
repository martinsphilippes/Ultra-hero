"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { Shine } from "./Shine";

// Entre um perfil e outro: a logomarca entra grande, diminui, aumenta e fixa (pedido do responsável, 04/11),
// com uma linha que cresce dos dois lados e o nome do próximo perfil. De tempo em tempo a luz passa pela linha da
// esquerda, pelo triângulo e pela linha da direita (Shine).
export function LogoInterlude({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("shown");
      return;
    }
    setState("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="uh-sb-interlude flex flex-col items-center gap-3 py-2" data-state={state === "hidden" ? "hidden" : "shown"}>
      <div className="flex w-full items-center gap-4">
        <span className="uh-sb-interlude-line uh-sb-shine-run h-px flex-1 bg-gradient-to-r from-transparent to-accent/60" style={{ "--sb-shine-delay": "3.9s" } as CSSProperties} />
        <span className="relative flex size-20 items-center justify-center">
          <span className="uh-sb-glow absolute inset-0 rounded-full bg-accent/25 blur-xl" />
          <span className="relative isolate block">
            <LogoMark className="uh-sb-interlude-mark block h-14" />
            <Shine kind="mark" delay={4.3} />
          </span>
        </span>
        <span className="uh-sb-interlude-line uh-sb-shine-run h-px flex-1 bg-gradient-to-l from-transparent to-accent/60" style={{ "--sb-shine-delay": "4.7s" } as CSSProperties} />
      </div>
      <span className="type-overline text-accent-text">{label}</span>
    </div>
  );
}
