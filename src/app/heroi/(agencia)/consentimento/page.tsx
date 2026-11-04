import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConsentCard } from "@/components/talent/ConsentCard";
import { getTalentContext } from "@/lib/talent/server";
import { CONSENT_VERSION } from "@/lib/talent/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("consent") };
}

// Termo de uso comercial (LGPD): aceitar libera o link do kit e o catálogo; revogar desliga os dois.
export default async function OfficeConsentPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  // 0091: membro da equipe do herói não fala pela imagem do titular
  if (ctx.talent.isTeamMember) {
    const t = await getTranslations("invites.team");
    return <p className="rounded-xl border border-border bg-surface px-4 py-3 type-body-sm text-fg-muted" data-testid="consent-team-member">{t("consentOwnerOnly")}</p>;
  }
  return <ConsentCard consentAt={ctx.talent.consentAt} consentRevokedAt={ctx.talent.consentRevokedAt} consentVersion={ctx.talent.consentVersion} currentVersion={CONSENT_VERSION} />;
}
