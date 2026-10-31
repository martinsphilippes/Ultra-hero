"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { markReadAction } from "@/lib/inbox/actions";

// "Marcar todas como lidas" da página de avisos (recarrega a lista depois).
export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("inbox");
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      leadingIcon={<CheckCheck />}
      loading={pending}
      disabled={disabled}
      onClick={() =>
        start(async () => {
          await markReadAction({});
          window.location.reload();
        })
      }
    >
      {t("markAll")}
    </Button>
  );
}
