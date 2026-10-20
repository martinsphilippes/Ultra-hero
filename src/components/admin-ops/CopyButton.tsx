"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";

type Props = { value: string; label?: string; size?: "sm" | "md"; className?: string };

// Copia um texto para a área de transferência com confirmação visual e sonora (toast/aria-live).
export function CopyButton({ value, label, size = "md", className }: Props) {
  const t = useTranslations("adminOps.common");
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: t("copied"), variant: "success" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  }

  return (
    <Button type="button" variant="secondary" size={size} onClick={copy} leadingIcon={copied ? <Check /> : <Copy />} className={className} aria-live="polite">
      {copied ? t("copied") : (label ?? t("copy"))}
    </Button>
  );
}
