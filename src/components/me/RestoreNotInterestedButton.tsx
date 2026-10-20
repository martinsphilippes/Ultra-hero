"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restoreNotInterested } from "@/app/(app)/profile/actions";
import { Button, useToast } from "@/components/ui";

type Props = { contentId: string; title: string };

// Remove a marcação "não tenho interesse" de um conteúdo.
export function RestoreNotInterestedButton({ contentId, title }: Props) {
  const t = useTranslations("me.interests");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function onRestore() {
    startTransition(async () => {
      const result = await restoreNotInterested({ contentId });
      if (!result.ok) {
        toast({ title: t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"), variant: "error" });
        return;
      }
      toast({ title: t("notInterested.restored"), variant: "success", duration: 2500 });
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" leadingIcon={<Undo2 />} onClick={onRestore} loading={pending} aria-label={t("notInterested.restore", { title })}>
      {t("notInterested.restoreShort")}
    </Button>
  );
}
