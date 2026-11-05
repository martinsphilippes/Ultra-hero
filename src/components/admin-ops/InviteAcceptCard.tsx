"use client";

import { CircleCheck, Mail } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { acceptInvitation, type AcceptedRole } from "@/app/admin/ops-actions";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button, Checkbox } from "@/components/ui";
import { SELLER_PORTAL_ENABLED } from "@/lib/seller-ops/portal";

type Props = { token: string; email: string | null };

// Aceite do convite pelo usuário autenticado: a RPC decide (token, validade, e-mail) e concede o acesso.
export function InviteAcceptCard({ token, email }: Props) {
  const t = useTranslations("adminOps.invite");
  const tc = useTranslations("legal.consent");
  const [terms, setTerms] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<AcceptedRole | null>(null);
  const [scopeType, setScopeType] = useState<string | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const ti = useTranslations("invites");

  function accept() {
    setError(null);
    if (!terms) {
      setError(tc("inviteRequired"));
      return;
    }
    startTransition(async () => {
      const result = await acceptInvitation({ token, acceptTerms: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setScopeType(result.scopeType);
      setHome(result.home);
      setRole(result.role);
    });
  }

  if (role) {
    // 0091: passo a passo da empresa, painel do admin, Equipe (creator sem Hero) e início (consumidor)
    const onboarding = scopeType === "onboarding";
    const message = onboarding
      ? ti("accept.successOnboarding")
      : role === "admin"
        ? ti("accept.successAdmin")
        : role === "consumer"
          ? ti("accept.successConsumer")
          : role === "agency"
            ? t("successAgency")
            : role === "brand"
              ? t("successBrand")
              : role === "professional"
                ? t("successProfessional")
                : role === "creator" && scopeType === "talent"
                  ? t("successTalent")
                  : role === "creator" && scopeType === "global"
                    ? ti("accept.successCreatorFree")
                    : role === "creator"
                      ? t("successCreator")
                      : SELLER_PORTAL_ENABLED
                        ? t("successSeller")
                        : t("successSellerPortalOff");
    const target = role === "seller" && !SELLER_PORTAL_ENABLED && !onboarding ? "/personalities" : (home ?? "/");
    const label = onboarding
      ? ti("accept.goOnboarding")
      : role === "admin"
        ? ti("accept.goAdmin")
        : role === "consumer"
          ? t("goHome")
          : role === "agency"
            ? t("goAgency")
            : role === "brand"
              ? t("goBrand")
              : role === "professional"
                ? t("goProfessional")
                : role === "creator" && scopeType === "talent"
                  ? t("goOffice")
                  : role === "creator" && scopeType === "global"
                    ? ti("accept.goHeroTeam")
                    : role === "creator"
                      ? t("goCreator")
                      : SELLER_PORTAL_ENABLED
                        ? t("goSeller")
                        : t("goHome");
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl border border-success/30 bg-success-soft text-success">
          <CircleCheck className="size-7" />
        </span>
        <div>
          <h2 className="type-h3 text-fg">{t("successTitle")}</h2>
          <p className="type-body-sm mt-1 text-fg-muted">{message}</p>
          {(role === "agency" || role === "brand") && !onboarding ? <p className="type-caption mt-2 text-fg-subtle">{t("inboxOnlyNote")}</p> : null}
        </div>
        <Button asChild size="lg" block>
          {/* escritório e painel do admin trocam de casca: navegação completa */}
          <a href={target}>{label}</a>
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
      {/* Termos do Parceiro (0068): aceite explícito, sem caixa pré-marcada */}
      <div className="rounded-xl border border-border px-2 py-1">
        <Checkbox id="invite-partner-terms" checked={terms} onChange={(event) => setTerms(event.target.checked)} label={tc.rich("inviteLabel", legalRichTags)} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          <span className="font-semibold">{t("errorTitle")}: </span>
          {error}
          <span className="mt-2 block text-fg-muted">{t("alreadyHint")}</span>
          <a href="/configuracoes" className="mt-1 inline-block font-semibold text-fg underline underline-offset-2">
            {t("openPortals")}
          </a>
        </p>
      )}
      <Button type="button" size="lg" block onClick={accept} loading={pending}>
        {pending ? t("accepting") : t("accept")}
      </Button>
      {/* direto para /personalities: "/" é só um redirect do next.config */}
      <Button asChild variant="ghost" block>
        <Link href="/personalities">{t("goHome")}</Link>
      </Button>
    </div>
  );
}
