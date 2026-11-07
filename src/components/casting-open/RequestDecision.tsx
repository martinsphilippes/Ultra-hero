"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideCastingAccessAction, decideProfileClaimAction } from "@/lib/casting-open/actions";
import { Button } from "@/components/ui";

// Aceitar/recusar um pedido ao casting (contato de outra agência ou perfil reivindicado pelo próprio Hero).
export function RequestDecision({ id, kind }: { id: string; kind: "access" | "claim" }) {
  const t = useTranslations("castingOpen.requests");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = kind === "access" ? await decideCastingAccessAction({ id, approve }) : await decideProfileClaimAction({ id, approve });
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="sm" leadingIcon={<X />} disabled={pending} onClick={() => decide(false)} data-testid={`${kind}-reject`}>
          {t("reject")}
        </Button>
        <Button type="button" size="sm" leadingIcon={<Check />} loading={pending} onClick={() => decide(true)} data-testid={`${kind}-approve`}>
          {t("approve")}
        </Button>
      </div>
      {error ? <p className="type-caption text-danger">{error}</p> : null}
    </div>
  );
}
