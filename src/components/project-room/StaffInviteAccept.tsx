"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { acceptStaffInviteAction } from "@/lib/project-room/actions";

/** Aceitar o convite de staff externo: entra na sala do projeto (o NDA vem em seguida, na própria sala). */
export function StaffInviteAccept({ token, email }: { token: string; email: string | null }) {
  const t = useTranslations("projectRoom.invite");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3" data-testid="staff-invite-accept">
      <p className="type-body-sm text-fg">{t("hint")}</p>
      {email ? <p className="type-caption text-fg-muted">{t("as", { email })}</p> : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        block
        leadingIcon={<Check />}
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptStaffInviteAction({ token });
            if (!result.ok || !result.dealId) return setError(result.ok ? t("failed") : result.error);
            router.push(`/projetos/${result.dealId}`);
          })
        }
        data-testid="staff-invite-accept-run"
      >
        {t("accept")}
      </Button>
    </div>
  );
}
