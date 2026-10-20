"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeListItem } from "@/app/(app)/explore/actions";
import { Button, useToast } from "@/components/ui";
import { useListError } from "./useListError";

type Props = { listId: string; contentId: string; title: string };

// Remove um conteúdo da lista (fica abaixo do card porque o card inteiro é um link).
export function RemoveFromListButton({ listId, contentId, title }: Props) {
  const t = useTranslations("discover.explore.lists");
  const { toast } = useToast();
  const errorMessage = useListError();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeListItem({ listId, contentId });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      toast({ title: t("removed"), variant: "success", duration: 2500 });
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={remove} loading={pending} leadingIcon={<X />} aria-label={t("removeItemOf", { title })} className="self-start">
      {t("removeItem")}
    </Button>
  );
}
