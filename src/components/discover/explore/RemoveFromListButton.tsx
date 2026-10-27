"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeListItem } from "@/app/(app)/explore/actions";
import { Button, useToast } from "@/components/ui";
import type { ListItemKind } from "@/lib/library/list-items";
import { useListError } from "./useListError";

type Props = { listId: string; kind?: ListItemKind; id: string; title: string };

// Remove um item (conteúdo, produto ou programa) da lista; fica abaixo do card porque o card inteiro é um link.
export function RemoveFromListButton({ listId, kind = "content", id, title }: Props) {
  const t = useTranslations("discover.explore.lists");
  const { toast } = useToast();
  const errorMessage = useListError();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeListItem({ listId, target: { kind, id } });
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
