"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { revokeInvitationAction } from "@/app/agencia/equipe/actions";
import { revokeBrandInviteAction } from "@/app/marca/actions";
import { Button, useToast } from "@/components/ui";

// Revoga um convite pendente (o banco confere quem pode, pelo escopo do próprio convite).
export function RevokeInviteButton({ id, email, from }: { id: string; email: string; from: "agency" | "brand" }) {
  const t = useTranslations("agency.invite");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      leadingIcon={<X />}
      loading={pending}
      aria-label={t("revokeFor", { email })}
      onClick={() =>
        start(async () => {
          const result = from === "agency" ? await revokeInvitationAction({ id }) : await revokeBrandInviteAction({ id });
          toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
        })
      }
    >
      {t("revoke")}
    </Button>
  );
}
