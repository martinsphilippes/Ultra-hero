"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/components/admin";
import { useToast } from "@/components/ui";

/** Roda uma server action do admin: erro na tela, sucesso em toast e a página recarregada. */
export function useRun() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T extends ActionResult>(fn: () => Promise<T>, after?: (result: T & { ok: true }) => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.message) toast({ title: result.message, variant: "success" });
      after?.(result as T & { ok: true });
      router.refresh();
    });
  }
  return { pending, error, run, setError };
}
