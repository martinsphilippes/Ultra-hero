"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { restoreServicesAction } from "@/lib/roadmap/actions";

// Acrescenta os serviços do modelo Groscove que faltam (nunca sobrescreve os editados).
export function RestoreServicesButton() {
  const t = useTranslations("roadmap.catalog");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      leadingIcon={<RotateCcw />}
      loading={pending}
      title={t("restoreHint")}
      onClick={() =>
        start(async () => {
          const result = await restoreServicesAction();
          toast(result.ok ? { title: result.message, variant: "success" } : { title: result.error, variant: "error" });
        })
      }
      data-testid="services-restore"
    >
      {t("restore")}
    </Button>
  );
}
