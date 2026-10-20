"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { toggleFavorite } from "@/app/(app)/content/actions";
import { IconButton, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useActionError } from "./useCompletionFeedback";

type Props = { contentId: string; initial: boolean; path?: string; className?: string };

// Favoritar com atualização otimista; reverte e avisa se a ação falhar.
export function FavoriteButton({ contentId, initial, path, className }: Props) {
  const t = useTranslations("consume.library");
  const { toast } = useToast();
  const errorMessage = useActionError();
  const [pending, startTransition] = useTransition();
  const [favorite, setOptimistic] = useOptimistic(initial);

  function onToggle() {
    const next = !favorite;
    startTransition(async () => {
      setOptimistic(next);
      const result = await toggleFavorite({ contentId, favorite: next, path });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      toast({ title: next ? t("favoriteAdded") : t("favoriteRemoved"), variant: "success", duration: 2500 });
    });
  }

  return (
    <IconButton
      label={favorite ? t("unfavorite") : t("favorite")}
      icon={<Heart className={cn(favorite && "fill-current")} />}
      variant="secondary"
      aria-pressed={favorite}
      onClick={onToggle}
      disabled={pending}
      className={cn(favorite && "text-accent-text border-accent/40", className)}
    />
  );
}
