"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Recarrega a página (tenta voltar à versão online).
export function ReloadButton({ label }: { label: string }) {
  return (
    <Button variant="primary" leadingIcon={<RefreshCw />} onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
