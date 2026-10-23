"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/(app)/profile/actions";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { DELETE_CONFIRM_WORD } from "./subscription";

// Exclusão self-service: exige digitar a palavra de confirmação; depois encerra a sessão e volta ao início.
export function DeleteAccountDialog() {
  const t = useTranslations("me.account.delete");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmed = value.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  // A palavra digitada nunca sobrevive a um fechamento: o Dialog não avisa onOpenChange quando o
  // fechamento vem do próprio estado, então Cancelar limpa aqui, e abrir também começa do zero
  // (senão, ao reabrir, "Excluir definitivamente" já viria habilitado).
  function show(next: boolean) {
    setOpen(next);
    setValue("");
    setError(null);
  }

  function onConfirm() {
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount({ confirmation: value.trim() });
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      toast({ title: t("done"), variant: "success", duration: 7000 });
      setOpen(false);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => show(true)}>
        {t("button")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) show(next);
        }}
        title={t("dialogTitle")}
        description={t("dialogDescription", { word: DELETE_CONFIRM_WORD })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => show(false)} disabled={pending} data-testid="delete-account-cancel">
              {tc("cancel")}
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={!confirmed} loading={pending}>
              {t("confirm")}
            </Button>
          </>
        }
      >
        <FormField label={t("confirmLabel")} error={error ?? undefined} required>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("confirmPlaceholder", { word: DELETE_CONFIRM_WORD })}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={pending}
            data-autofocus
          />
        </FormField>
      </Dialog>
    </>
  );
}
