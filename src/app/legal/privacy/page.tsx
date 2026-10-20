import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.meta");
  return { title: t("privacy"), description: t("privacyDescription") };
}

// Política de Privacidade (pública). Texto em messages/<locale>/legal.json → privacy.
// Cada afirmação deve refletir o código: cookies, retenção (run_retention), exclusão (delete_my_account), IA.
export default function PrivacyPage() {
  return <LegalDocument doc="privacy" />;
}
