"use client";

import { Play, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { enrollProgram } from "@/app/(app)/programs/actions";
import { useActionError } from "@/components/library";
import { Button, useToast } from "@/components/ui";
import { getDeviceTimeZone } from "@/lib/utils/timezone";

type Props = { programId: string; path: string; reenroll?: boolean; className?: string };

// Inscreve no programa com o fuso do dispositivo (conta como atividade do dia).
export function EnrollButton({ programId, path, reenroll = false, className }: Props) {
  const t = useTranslations("consume.program");
  const { toast } = useToast();
  const errorMessage = useActionError();
  const [pending, startTransition] = useTransition();

  function onEnroll() {
    startTransition(async () => {
      const result = await enrollProgram({ programId, timezone: getDeviceTimeZone(), path });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      toast({ title: t("enrolled"), description: t("freeOrder"), variant: "success" });
    });
  }

  return (
    <Button variant="primary" size="lg" onClick={onEnroll} loading={pending} leadingIcon={reenroll ? <RotateCcw /> : <Play />} className={className}>
      {pending ? t("enrolling") : reenroll ? t("reenroll") : t("enroll")}
    </Button>
  );
}
