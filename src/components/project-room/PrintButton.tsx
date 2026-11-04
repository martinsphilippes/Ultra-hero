"use client";

import { useTranslations } from "next-intl";
import { PrintButton as DownloadPdfButton } from "@/components/media/PrintButton";

/** "Baixar PDF" do clipping, das estratégias e do relatório do casting: gera o PDF da página. */
export function PrintButton() {
  const t = useTranslations("projectRoom.clipping");
  return <DownloadPdfButton label={t("print")} testId="clipping-print" />;
}
