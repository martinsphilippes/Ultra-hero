"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Cartão que inclina levemente seguindo o mouse/dedo (só apresentação; "reduzir movimento" desliga pelo CSS).
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const move = (x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (x - r.left) / r.width - 0.5;
    const py = (y - r.top) / r.height - 0.5;
    el.style.setProperty("--uh-sb-ry", `${(px * 10).toFixed(2)}deg`);
    el.style.setProperty("--uh-sb-rx", `${(-py * 10).toFixed(2)}deg`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--uh-sb-rx", "0deg");
    ref.current?.style.setProperty("--uh-sb-ry", "0deg");
  };
  return (
    <div
      ref={ref}
      className={cn("uh-sb-tilt", className)}
      onPointerMove={(e) => move(e.clientX, e.clientY)}
      onPointerLeave={reset}
      onPointerUp={reset}
    >
      {children}
    </div>
  );
}
