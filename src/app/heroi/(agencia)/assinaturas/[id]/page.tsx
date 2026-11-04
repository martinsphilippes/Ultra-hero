import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SignatureReceiptView } from "@/components/signature/SignatureReceiptView";
import { getSignatureReceipt } from "@/lib/signature/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commercial.signature");
  return { title: t("receiptTitle") };
}

type Props = { params: Promise<{ id: string }> };

// Comprovante de assinatura (0084) no escritório: só a assinatura da própria pessoa (o banco decide).
export default async function OfficeSignatureReceiptPage({ params }: Props) {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const { data } = await getSignatureReceipt(id);
  if (!data) notFound();
  return <SignatureReceiptView receipt={data} backHref={data.dealTalentId ? `/heroi/oportunidades/${data.dealTalentId}` : "/heroi/oportunidades"} />;
}
