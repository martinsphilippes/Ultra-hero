"use client";

import { HeartOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeHistoryItem, removeSavedRecipe } from "@/app/(app)/profile/receitas/actions";
import { Button, Dialog, useToast } from "@/components/ui";

type Props = { kind: "saved" | "history"; contentId: string; title: string };

// Remover da coleção: tira dos favoritos (salvas) ou só do histórico. Fica abaixo do card porque o
// card inteiro é um link; a página recarrega para atualizar contagens e categorias. Tirar das salvas
// pede confirmação: um toque sem querer ao rolar apagaria o favorito sem como desfazer.
export function RemoveRecipeButton({ kind, contentId, title }: Props) {
  const t = useTranslations("kitchen.collection");
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onRemove() {
    startTransition(async () => {
      const result = kind === "saved" ? await removeSavedRecipe({ contentId }) : await removeHistoryItem({ contentId });
      if (!result.ok) {
        toast({ title: t("history.errors.generic"), variant: "error" });
        return;
      }
      setConfirming(false);
      toast({ title: kind === "saved" ? t("saved.removed") : t("history.removed"), variant: "info", duration: 2500 });
      router.refresh();
    });
  }

  const button = (
    <Button
      variant="ghost"
      size="md"
      leadingIcon={kind === "saved" ? <HeartOff /> : <X />}
      onClick={kind === "saved" ? () => setConfirming(true) : onRemove}
      loading={pending}
      aria-label={kind === "saved" ? t("saved.removeLabel", { title }) : t("history.removeLabel", { title })}
      // no histórico o rótulo é longo ("Remove from history"): quebra dentro da coluna de 2 por linha
      // do celular em vez de passar da borda do card e fazer a página rolar na horizontal
      className={kind === "history" ? "h-auto min-h-11 max-w-full self-start whitespace-normal py-2 text-left text-fg-muted" : "self-start text-fg-muted"}
      data-testid={kind === "saved" ? "saved-remove" : "history-remove"}
    >
      {kind === "saved" ? t("saved.remove") : t("history.remove")}
    </Button>
  );
  if (kind !== "saved") return button;

  return (
    <>
      {button}
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(false);
        }}
        title={t("saved.confirmTitle")}
        description={t("saved.confirmDescription", { title })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              {t("saved.cancel")}
            </Button>
            <Button variant="danger" onClick={onRemove} loading={pending} data-testid="saved-remove-confirm">
              {t("saved.confirmButton")}
            </Button>
          </>
        }
      />
    </>
  );
}
