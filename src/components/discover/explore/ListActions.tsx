"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { deleteList, renameList } from "@/app/(app)/explore/actions";
import { Button, Dialog, FormField, IconButton, Input, useToast } from "@/components/ui";
import { useListError } from "./useListError";

type Props = {
  listId: string;
  name: string;
  /** Tamanho dos botões (sm nos cards, md no cabeçalho da lista). */
  size?: "sm" | "md";
  /** Para onde ir após excluir (ex.: na página da lista, volta às listas). */
  afterDeleteHref?: string;
};

// Renomear e excluir uma lista pessoal, cada ação com seu diálogo de confirmação.
export function ListActions({ listId, name, size = "sm", afterDeleteHref }: Props) {
  const t = useTranslations("discover.explore.lists");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const errorMessage = useListError();
  const router = useRouter();
  const formId = useId();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setDialog(null);
    setError(null);
    setDraft(name);
  }

  function onRename(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return setError(errorMessage("nameRequired"));
    if (trimmed.length > 60) return setError(errorMessage("nameTooLong"));
    setError(null);
    startTransition(async () => {
      const result = await renameList({ listId, name: trimmed });
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      toast({ title: t("renamed"), variant: "success" });
      setDialog(null);
      router.refresh();
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteList({ listId });
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      toast({ title: t("deleted"), variant: "success" });
      setDialog(null);
      if (afterDeleteHref) router.push(afterDeleteHref);
      else router.refresh();
    });
  }

  return (
    <div role="group" aria-label={t("actionsLabel", { name })} className="flex items-center gap-1">
      <IconButton label={t("rename")} icon={<Pencil />} size={size} variant="ghost" onClick={() => setDialog("rename")} />
      <IconButton label={t("delete")} icon={<Trash2 />} size={size} variant="ghost" onClick={() => setDialog("delete")} className="hover:text-danger" />

      <Dialog
        open={dialog === "rename"}
        onOpenChange={(open) => (open ? setDialog("rename") : close())}
        title={t("renameTitle")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {tc("save")}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onRename} className="py-2">
          <FormField label={t("nameLabel")} hint={t("nameHint")} error={error} required>
            <Input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={60} autoComplete="off" data-autofocus />
          </FormField>
        </form>
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onOpenChange={(open) => (open ? setDialog("delete") : close())}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button variant="danger" onClick={onDelete} loading={pending} data-autofocus>
              {t("delete")}
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </div>
  );
}
