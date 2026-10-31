import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.meta");
  return { title: t("partner"), description: t("partnerDescription") };
}

// Termos do Parceiro (público): heróis e agências aceitam no convite e confirmam os direitos antes do 1º envio.
// Texto em messages/<locale>/legal.json → partner. Versão aceita: PARTNER_TERMS_VERSION (src/lib/partner-terms).
export default function PartnerTermsPage() {
  return <LegalDocument doc="partner" />;
}
