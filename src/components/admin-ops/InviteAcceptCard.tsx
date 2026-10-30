"use client";

import { CircleCheck, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/admin/ops-actions";
import { Button } from "@/components/ui";
import { SELLER_PORTAL_ENABLED } from "@/lib/seller-ops/portal";

type Props = { token: string; email: string | null };

// Aceite do convite pelo usuário autenticado: a RPC decide (token, validade, e-mail) e concede o acesso.
export function InviteAcceptCard({ token, email }: Props) {
  const t = useTranslations("adminOps.invite");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"creator" | "seller" | "professional" | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitation({ token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRole(result.role);
    });
  }

  if (role) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl border border-success/30 bg-success-soft text-success">
          <CircleCheck className="size-7" />
        </span>
        <div>
          <h2 className="type-h3 text-fg">{t("successTitle")}</h2>
          <p className="type-body-sm mt-1 text-fg-muted">
            {role === "professional" ? t("successProfessional") : role === "creator" ? t("successCreator") : SELLER_PORTAL_ENABLED ? t("successSeller") : t("successSellerPortalOff")}
          </p>
        </div>
        <Button asChild size="lg" block>
          {/* portal do fornecedor desligado (0053): volta ao app */}
          {role === "professional" ? (
            <Link href="/profissional">{t("goProfessional")}</Link>
          ) : role === "creator" ? (
            <Link href="/profile">{t("goCreator")}</Link>
          ) : SELLER_PORTAL_ENABLED ? (
            <Link href="/seller">{t("goSeller")}</Link>
          ) : (
            <Link href="/personalities">{t("goHome")}</Link>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-3">
        <Mail className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {email && <p className="truncate font-medium text-fg">{t("signedInAs", { email })}</p>}
          <p className="text-fg-muted">{t("grantNote")}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          <span className="font-semibold">{t("errorTitle")}: </span>
          {error}
        </p>
      )}
      <Button type="button" size="lg" block onClick={accept} loading={pending}>
        {pending ? t("accepting") : t("accept")}
      </Button>
      <Button asChild variant="ghost" block>
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </div>
  );
}
