"use client";

import { HeartOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { removeFavorite } from "@/app/(app)/profile/actions";
import { Button, useToast } from "@/components/ui";
import type { ListItemKind } from "@/lib/library/list-items";

type Props = { kind?: ListItemKind; id: string; title: string; children: ReactNode };

// Card de favorito (conteúdo, produto ou programa) com botão de remoção (some da grade ao confirmar).
export function FavoriteItem({ kind = "content", id, title, children }: Props) {
  const t = useTranslations("me.favorites");
  const { toast } = useToast();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  function onRemove() {
    startTransition(async () => {
      const result = await removeFavorite({ target: { kind, id } });
      if (!result.ok) {
        toast({ title: t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"), variant: "error" });
        return;
      }
      toast({ title: t("removed"), variant: "info", duration: 2500 });
      setHidden(true);
    });
  }

  return (
    <li className="flex h-full flex-col gap-2" data-testid="favorite-entry" data-kind={kind}>
      <div className="flex-1">{children}</div>
      <Button variant="ghost" size="sm" leadingIcon={<HeartOff />} onClick={onRemove} loading={pending} aria-label={t("remove", { title })} className="self-start text-fg-muted">
        {t("removeShort")}
      </Button>
    </li>
  );
}
