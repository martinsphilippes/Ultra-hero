"use client";

import { useEffect, useRef } from "react";
import { trackSearch } from "@/app/(app)/explore/actions";

type Props = { queryKey: string; qLen: number; pillar?: string | null; type?: string | null };

// Registra o evento "search" uma vez por combinação de busca/filtros (sem o texto digitado).
export function SearchTracker({ queryKey, qLen, pillar, type }: Props) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === queryKey) return;
    last.current = queryKey;
    void trackSearch({ qLen, pillar: pillar ?? null, type: type ?? null });
  }, [queryKey, qLen, pillar, type]);
  return null;
}
