"use client";

import { DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { setRoomOpenAction } from "@/lib/project-room/actions";

/** Abrir a sala antes do automático (roteiro gerado ou negócio confirmado). */
export function OpenRoomButton({ dealId }: { dealId: string }) {
  const t = useTranslations("projectRoom.room");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      leadingIcon={<DoorOpen />}
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await setRoomOpenAction({ dealId, open: true });
          toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
        })
      }
      data-testid="room-open"
    >
      {t("openNow")}
    </Button>
  );
}
