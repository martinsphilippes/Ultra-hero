import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SignatureReceiptView } from "@/components/signature/SignatureReceiptView";
import { getBrandContext } from "@/lib/brand-portal/server";
import { getSignatureReceipt } from "@/lib/signature/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commercial.signature");
  return { title: t("receiptTitle") };
}

type Props = { params: Promise<{ id: string }> };

// Comprovante de assinatura (0084) no portal da marca: só a assinatura da própria marca (o banco decide).
export default async function BrandSignatureReceiptPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const { data } = await getSignatureReceipt(id);
  if (!data) notFound();
  return <SignatureReceiptView receipt={data} backHref={data.requestId ? `/marca/campanhas/${data.requestId}` : "/marca/campanhas"} />;
}
