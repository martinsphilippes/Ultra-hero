"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreRecipeVersion } from "@/app/creator/recipes/actions";
import { Button, Dialog, useToast } from "@/components/ui";
import { draftStorageKey } from "@/lib/recipes/draft-recovery";
import { useRecipeErrorText } from "./use-recipe-error";

// "Restaurar no rascunho": a RPC reconstrói as tabelas a partir da versão (fotos que já não existem
// não voltam; nutrição volta sem validação). A cópia local do editor é descartada para não trazer
// de volta o rascunho antigo por cima da versão restaurada.
export function RestoreVersionButton({ versionId, contentId, creatorId, versionNo }: { versionId: string; contentId: string; creatorId: string; versionNo: number }) {
  const t = useTranslations("recipes.versions");
  const tc = useTranslations("common.actions");
  const errorText = useRecipeErrorText();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await restoreRecipeVersion({ versionId, contentId });
        if (!result.ok) {
          setError(errorText(result.error));
          return;
        }
        try {
          window.localStorage.removeItem(draftStorageKey(creatorId, contentId));
        } catch {
          // sem acesso ao armazenamento local: nada a limpar
        }
        toast({ title: t("restored"), variant: "success" });
        setOpen(false);
        router.push(`/creator/recipes/${contentId}/edit`);
        router.refresh();
      } catch {
        setError(errorText("network"));
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" leadingIcon={<RotateCcw />} onClick={() => setOpen(true)}>
        {t("restore")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("restoreTitle", { n: versionNo })}
        description={t("restoreDescription")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={confirm} loading={pending}>
              {t("restore")}
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
