"use client";

import { ListPlus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { addToList, createListAndAdd, getMyLists, removeFromList, type MyList } from "@/app/(app)/content/actions";
import type { ListItemKind } from "@/lib/library/list-items";
import { Button, Checkbox, EmptyState, FormField, IconButton, Input, Sheet, Skeleton, useToast } from "@/components/ui";
import { useActionError } from "./useCompletionFeedback";

type Props = {
  kind?: ListItemKind;
  id: string;
  className?: string;
  /** Botão com texto (página de produto e de programa); sem ele, só o ícone (barra de ações do conteúdo). */
  withLabel?: boolean;
};

// Salvar em listas pessoais: abre um painel com as listas (marcando onde o item já está)
// e um formulário para criar uma lista nova já com o item. Serve a conteúdo, produto e programa.
export function AddToListButton({ kind = "content", id, className, withLabel = false }: Props) {
  const t = useTranslations("consume.library");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useActionError();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<MyList[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Carrega as listas ao abrir (sempre fresco: outras telas podem ter criado listas).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLists(null);
    setLoadError(null);
    getMyLists({ target: { kind, id } }).then((result) => {
      if (cancelled) return;
      if (result.ok) setLists(result.lists);
      else setLoadError(errorMessage(result.error));
    });
    return () => {
      cancelled = true;
    };
  }, [open, kind, id, errorMessage]);

  function toggle(list: MyList) {
    const next = !list.contains;
    setBusyId(list.id);
    startTransition(async () => {
      const target = { kind, id };
      const result = next ? await addToList({ listId: list.id, target }) : await removeFromList({ listId: list.id, target });
      setBusyId(null);
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, contains: next, count: l.count + (next ? 1 : -1) } : l)) ?? prev);
      toast({ title: next ? t("addedToList", { name: list.name }) : t("removedFromList", { name: list.name }), variant: "success", duration: 2500 });
    });
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 60) {
      setNameError(errorMessage("invalid_input"));
      return;
    }
    setNameError(null);
    startTransition(async () => {
      const result = await createListAndAdd({ name: trimmed, target: { kind, id } });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      setLists((prev) => [result.list, ...(prev ?? [])]);
      setName("");
      toast({ title: t("listCreated", { name: result.list.name }), description: t("addedToList", { name: result.list.name }), variant: "success" });
    });
  }

  return (
    <>
      {withLabel ? (
        <Button variant="secondary" leadingIcon={<ListPlus />} onClick={() => setOpen(true)} className={className} data-testid="add-to-list">
          {t("addToList")}
        </Button>
      ) : (
        <IconButton label={t("addToList")} icon={<ListPlus />} variant="secondary" onClick={() => setOpen(true)} className={className} data-testid="add-to-list" />
      )}
      <Sheet open={open} onOpenChange={setOpen} title={t("listsTitle")} description={t("listsDescription", { kind })}>
        <div className="flex flex-col gap-4 py-2">
          {loadError ? (
            <p role="alert" className="type-body-sm text-danger">
              {loadError}
            </p>
          ) : lists === null ? (
            <div role="status" aria-busy="true" className="flex flex-col gap-3">
              <span className="sr-only">{tc("states.loading")}</span>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : lists.length === 0 ? (
            <EmptyState size="sm" icon={<ListPlus />} title={t("listsEmpty")} description={t("listsEmptyDescription")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border" aria-label={t("listsTitle")}>
              {lists.map((list) => (
                <li key={list.id} className="flex items-center justify-between gap-3 py-1">
                  <Checkbox
                    id={`list-${list.id}`}
                    checked={list.contains}
                    disabled={pending && busyId === list.id}
                    onChange={() => toggle(list)}
                    label={list.name}
                    description={t("listItems", { n: list.count })}
                    aria-label={t("toggleList", { name: list.name })}
                  />
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={onCreate} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4">
            <FormField label={t("newListLabel")} error={nameError} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t("newListPlaceholder")} autoComplete="off" />
            </FormField>
            <Button type="submit" variant="primary" loading={pending && busyId === null} leadingIcon={<Plus />} block>
              {t("createAndAdd")}
            </Button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
