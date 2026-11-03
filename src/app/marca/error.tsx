"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";
import { recoverFromStaleBuild } from "@/lib/stale-build";

// Limite de erro do portal da marca.
export default function BrandError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // aba numa versão antiga do app depois de uma publicação: recarrega uma vez (src/lib/stale-build.ts)
    recoverFromStaleBuild(error);
  }, [error]);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ErrorState onRetry={reset} digest={error.digest} />
    </div>
  );
}
