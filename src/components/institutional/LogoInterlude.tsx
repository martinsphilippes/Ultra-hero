"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/layout/Logo";

// Entre um perfil e outro: a logomarca entra grande, diminui, aumenta e fixa (pedido do responsável, 04/11),
// com uma linha que cresce dos dois lados e o nome do próximo perfil.
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
    <div ref={ref} aria-hidden="true" className="uh-interlude flex flex-col items-center gap-3 py-2" data-state={state === "hidden" ? "hidden" : "shown"}>
      <div className="flex w-full items-center gap-4">
        <span className="uh-interlude-line h-px flex-1 bg-gradient-to-r from-transparent to-accent/60" />
        <span className="relative flex size-20 items-center justify-center">
          <span className="uh-glow absolute inset-0 rounded-full bg-accent/25 blur-xl" />
          <LogoMark className="uh-interlude-mark relative h-14" />
        </span>
        <span className="uh-interlude-line h-px flex-1 bg-gradient-to-l from-transparent to-accent/60" />
      </div>
      <span className="type-overline text-accent-text">{label}</span>
    </div>
  );
}
