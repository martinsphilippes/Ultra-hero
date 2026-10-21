"use client";

import { useEffect, useState } from "react";
import { storageAvailable, type StorageLike } from "@/lib/routine/local-log";

// Storage do navegador, só depois de montar (evita divergência SSR/cliente); null em modo privado
// ou com dados de site bloqueados. `ready` separa "ainda não li" de "não há storage".
export function useLocalStorage(): { storage: StorageLike | null; ready: boolean } {
  const [state, setState] = useState<{ storage: StorageLike | null; ready: boolean }>({ storage: null, ready: false });
  useEffect(() => {
    let storage: StorageLike | null = null;
    try {
      storage = storageAvailable(window.localStorage) ? window.localStorage : null;
    } catch {
      storage = null;
    }
    setState({ storage, ready: true });
  }, []);
  return state;
}
