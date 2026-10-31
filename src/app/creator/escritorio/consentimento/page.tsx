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
  return <ConsentCard consentAt={ctx.talent.consentAt} consentRevokedAt={ctx.talent.consentRevokedAt} consentVersion={ctx.talent.consentVersion} currentVersion={CONSENT_VERSION} />;
}
