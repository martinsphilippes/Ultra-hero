"use client";

import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { publishSponsorshipAction } from "@/lib/finance/actions";

// Publica a marca como patrocinadora do herói ligado ao creator (gestor+, ação humana; nunca automática).
export function SponsorshipButton({ dealTalentId, dealId, name }: { dealTalentId: string; dealId: string; name: string }) {
  const t = useTranslations("agency.sponsorship");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  function run() {
    if (!window.confirm(t("confirm", { name }))) return;
    start(async () => {
      const result = await publishSponsorshipAction({ dealTalentId, dealId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }
  return (
    <Button type="button" size="sm" variant="secondary" leadingIcon={<Megaphone />} onClick={run} loading={pending} data-testid="sponsorship-publish">
      {t("publish")}
    </Button>
  );
}
