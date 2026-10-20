"use client";

import { useEffect, useRef } from "react";
import { trackPlanView } from "@/app/(app)/profile/actions";

// Registra plan.view uma vez por montagem da página de planos.
export function PlanViewTracker() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void trackPlanView();
  }, []);
  return null;
}
