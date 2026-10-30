"use client";

import { useEffect } from "react";

// Visita à página do herói (0061): manda para /api/hero-page-views sem esperar (sendBeacon). Uma vez
// por herói a cada carregamento do site ou do app; nada da pessoa vai junto. Não renderiza nada.
const sent = new Set<string>();

export function HeroPageViewTracker({ creatorId }: { creatorId: string }) {
  useEffect(() => {
    if (sent.has(creatorId)) return;
    sent.add(creatorId);
    try {
      const body = JSON.stringify({ creatorId });
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon?.("/api/hero-page-views", blob)) return;
      void fetch("/api/hero-page-views", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    } catch {
      // nunca atrapalha a navegação
    }
  }, [creatorId]);
  return null;
}
