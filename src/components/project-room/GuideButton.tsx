"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { roomFileUrlAction } from "@/lib/project-room/actions";

/** Abre o guia de uso (PDF da sala) por URL assinada de 60 s — também depois do fechamento, pelo clipping. */
export function GuideButton({ messageId }: { messageId: string }) {
  const t = useTranslations("projectRoom.room");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="print:hidden"
      leadingIcon={<Download />}
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await roomFileUrlAction({ messageId });
          if (!result.ok || !result.url) return void toast({ title: result.ok ? t("openFailed") : result.error, variant: "error" });
          window.open(result.url, "_blank", "noopener,noreferrer");
        })
      }
      data-testid="room-guide-open"
    >
      {t("openGuide")}
    </Button>
  );
}
