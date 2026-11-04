"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

/** "Baixar PDF": abre a impressão do navegador (Salvar como PDF); a página tem estilos de impressão. */
export function PrintButton() {
  const t = useTranslations("projectRoom.clipping");
  return (
    <Button type="button" leadingIcon={<Printer />} onClick={() => window.print()} data-testid="clipping-print">
      {t("print")}
    </Button>
  );
}
