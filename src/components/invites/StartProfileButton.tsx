"use client";

import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { startProfileAction } from "@/app/comecar/actions";
import { Button } from "@/components/ui";
import type { BusinessProfile } from "@/lib/auth/profile-signup";

// "Começar" (0103): guarda a escolha no banco e abre o passo a passo; erro (limite, já tem agência…) aparece aqui.
export function StartProfileButton({ profile, label }: { profile: BusinessProfile; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" data-testid="start-error">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        block
        loading={pending}
        trailingIcon={<ArrowRight />}
        data-testid="start-profile"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await startProfileAction({ profile });
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {label}
      </Button>
    </div>
  );
}
