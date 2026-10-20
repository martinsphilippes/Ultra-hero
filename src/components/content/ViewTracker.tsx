"use client";

import { useEffect, useRef } from "react";
import { trackView } from "@/app/(app)/content/actions";

type Props = { kind: "content" | "program"; id: string; extra?: Record<string, string | number | boolean | null> };

// Registra content.view / program.view uma única vez por montagem (sem PII).
export function ViewTracker({ kind, id, extra }: Props) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void trackView({ kind, id, extra });
  }, [kind, id, extra]);
  return null;
}
