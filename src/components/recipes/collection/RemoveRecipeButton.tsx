"use client";

import { HeartOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeHistoryItem, removeSavedRecipe } from "@/app/(app)/profile/receitas/actions";
import { Button, useToast } from "@/components/ui";

type Props = { kind: "saved" | "history"; contentId: string; title: string };

// Remover da coleção: tira dos favoritos (salvas) ou só do histórico. Fica abaixo do card porque o
// card inteiro é um link; a página recarrega para atualizar contagens e categorias.
export function RemoveRecipeButton({ kind, contentId, title }: Props) {
  const t = useTranslations("kitchen.collection");
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRemove() {
    startTransition(async () => {
      const result = kind === "saved" ? await removeSavedRecipe({ contentId }) : await removeHistoryItem({ contentId });
      if (!result.ok) {
        toast({ title: t("history.errors.generic"), variant: "error" });
        return;
      }
      toast({ title: kind === "saved" ? t("saved.removed") : t("history.removed"), variant: "info", duration: 2500 });
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="md"
      leadingIcon={kind === "saved" ? <HeartOff /> : <X />}
      onClick={onRemove}
      loading={pending}
      aria-label={kind === "saved" ? t("saved.removeLabel", { title }) : t("history.removeLabel", { title })}
      className="self-start text-fg-muted"
      data-testid={kind === "saved" ? "saved-remove" : "history-remove"}
    >
      {kind === "saved" ? t("saved.remove") : t("history.remove")}
    </Button>
  );
}
