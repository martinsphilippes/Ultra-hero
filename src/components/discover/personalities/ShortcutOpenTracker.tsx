"use client";

import { useEffect } from "react";
import type { LibraryKey } from "@/lib/catalog/creator-libraries";

// Abertura de atalho do herói (0060): manda para /api/shortcut-opens sem esperar (sendBeacon).
// Uma vez por herói e atalho a cada carregamento da aba; nada da pessoa vai junto. Não renderiza nada.
const sent = new Set<string>();

export function ShortcutOpenTracker({ creatorId, sourceKey }: { creatorId: string; sourceKey: LibraryKey }) {
  useEffect(() => {
    const key = `${creatorId}:${sourceKey}`;
    if (sent.has(key)) return;
    sent.add(key);
    try {
      const body = JSON.stringify({ creatorId, sourceKey });
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon?.("/api/shortcut-opens", blob)) return;
      void fetch("/api/shortcut-opens", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    } catch {
      // nunca atrapalha a navegação
    }
  }, [creatorId, sourceKey]);
  return null;
}
