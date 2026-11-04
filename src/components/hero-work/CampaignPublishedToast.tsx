"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui";

// Volta para a campanha depois de publicar (?publicado=): o aviso de sucesso, uma vez por chegada. Com entrega
// esperando um link, o aviso aponta para "Enviar como entrega" (o link já vem preenchido no quadro de entregas).
export function CampaignPublishedToast({ slug, canSend }: { slug: string; canSend: boolean }) {
  const t = useTranslations("heroWork.campaign.published");
  const { toast } = useToast();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current === slug) return;
    shown.current = slug;
    toast({ title: t("title"), description: canSend ? t("send") : t("noPending"), variant: "success" });
  }, [slug, canSend, t, toast]);
  return null;
}
