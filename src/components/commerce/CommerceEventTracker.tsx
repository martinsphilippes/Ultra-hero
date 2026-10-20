"use client";

import { useEffect, useRef } from "react";
import { trackCommerceEvent } from "@/app/(app)/shop/actions";

type Props = { event: "product.view" | "checkout.start"; properties?: Record<string, string | number | boolean | null> };

// Dispara um evento de comércio uma única vez por montagem (sem PII).
export function CommerceEventTracker({ event, properties }: Props) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void trackCommerceEvent({ event, properties });
  }, [event, properties]);
  return null;
}
