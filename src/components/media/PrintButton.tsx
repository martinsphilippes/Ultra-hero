"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

// "Baixar PDF": abre a impressão do navegador (escolher "Salvar como PDF"); o CSS de impressão monta a página A4.
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" leadingIcon={<Printer />} onClick={() => window.print()} className="print:hidden" data-testid="report-print">
      {label}
    </Button>
  );
}
