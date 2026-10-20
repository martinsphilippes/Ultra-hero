"use client";

import { useEffect, useRef } from "react";
import { trackRecommendationEvent } from "@/lib/recommendations/actions";

type Props = { engine: "deterministic" | "openai" | "gemini" | "open_picks"; isFallback: boolean; count: number };

// Registra recommendation.view uma vez por montagem da seção (sem PII).
export function RecommendationsTracker({ engine, isFallback, count }: Props) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void trackRecommendationEvent({ kind: "view", engine, isFallback, count });
  }, [engine, isFallback, count]);
  return null;
}
