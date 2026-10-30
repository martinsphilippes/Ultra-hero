"use client";

import { useCallback, useSyncExternalStore } from "react";

// Estado confirmado do seguir por herói, compartilhado na aba: o mesmo herói aparece em vários
// posts do feed e todos os botões dele mudam juntos. Some ao recarregar (o servidor é a fonte).
const confirmed = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setConfirmedFollow(creatorId: string, following: boolean) {
  confirmed.set(creatorId, following);
  version += 1;
  listeners.forEach((l) => l());
}

/** Seguindo confirmado: o que a aba já gravou, ou o que veio do servidor. */
export function useConfirmedFollow(creatorId: string, initial: boolean): boolean {
  const get = useCallback(() => confirmed.get(creatorId) ?? initial, [creatorId, initial]);
  return useSyncExternalStore(subscribe, get, () => initial);
}

/** Leitura de vários heróis de uma vez (re-renderiza a cada mudança confirmada). */
export function useFollowLookup(): (creatorId: string, initial: boolean) => boolean {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a versão invalida a leitura
  return useCallback((creatorId: string, initial: boolean) => confirmed.get(creatorId) ?? initial, [v]);
}
