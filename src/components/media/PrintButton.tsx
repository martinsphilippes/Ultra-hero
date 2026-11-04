"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { downloadPagePdf } from "@/lib/pdf/download-page";

// "Baixar PDF": gera o arquivo A4 do conteúdo da página (tema claro). Se a geração falhar, cai na impressão do
// navegador ("Salvar como PDF"), que usa o CSS de impressão da página.
export function PrintButton({ label, fileName, testId = "report-print" }: { label: string; fileName?: string; testId?: string }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadPagePdf(fileName ?? document.title);
    } catch {
      window.print();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" leadingIcon={<Printer />} onClick={run} loading={busy} className="print:hidden" data-testid={testId}>
      {label}
    </Button>
  );
}
