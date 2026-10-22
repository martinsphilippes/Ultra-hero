"use client";

import { useEffect } from "react";
import { clearLegacyTodayStorage } from "@/lib/routine/local-cleanup";

// Roda uma vez por aparelho: apaga os registros locais de hidratação e descanso do Hoje antigo.
// Não renderiza nada e não envia nada ao servidor.
export function LegacyTodayCleanup() {
  useEffect(() => {
    try {
      clearLegacyTodayStorage(window.localStorage);
    } catch {
      // acessar window.localStorage pode lançar com dados do site bloqueados
    }
  }, []);
  return null;
}
