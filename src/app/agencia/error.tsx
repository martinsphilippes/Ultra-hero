"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

// Limite de erro do portal da agência.
export default function AgencyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ErrorState onRetry={reset} digest={error.digest} />
    </div>
  );
}
