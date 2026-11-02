import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SignatureReceiptView } from "@/components/signature/SignatureReceiptView";
import { requireAgency } from "@/lib/agency/server";
import { getSignatureReceipt } from "@/lib/signature/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commercial.signature");
  return { title: t("receiptTitle") };
}

type Props = { params: Promise<{ id: string }> };

// Comprovante de assinatura (0084) na agência: gestor+ ou equipe do negócio (o banco decide).
export default async function AgencySignatureReceiptPage({ params }: Props) {
  await requireAgency("staff");
  const { id } = await params;
  const { data } = await getSignatureReceipt(id);
  if (!data) notFound();
  return <SignatureReceiptView receipt={data} backHref={`/agencia/negocios/${data.dealId}/termos`} />;
}
