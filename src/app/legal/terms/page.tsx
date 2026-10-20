import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.meta");
  return { title: t("terms"), description: t("termsDescription") };
}

// Termos de Uso (público). Texto em messages/<locale>/legal.json → terms.
export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
