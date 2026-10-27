"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createList } from "@/app/(app)/explore/actions";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { useListError } from "./useListError";

// Cria uma lista pessoal (nome até 60 caracteres) num diálogo; ao criar, abre a lista.
export function CreateListButton({ className }: { className?: string }) {
  const t = useTranslations("discover.explore.lists");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const errorMessage = useListError();
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setError(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(errorMessage("nameRequired"));
    if (trimmed.length > 60) return setError(errorMessage("nameTooLong"));
    setError(null);
    startTransition(async () => {
      const result = await createList({ name: trimmed });
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      toast({ title: t("created"), variant: "success" });
      onOpenChange(false);
      router.push(`/explore/lists/${result.id}`);
    });
  }

  return (
    <>
      <Button variant="primary" size="sm" leadingIcon={<Plus />} onClick={() => setOpen(true)} className={className}>
        {t("create")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("createTitle")}
        description={`${t("createDescription")} ${t("mixHint")}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {t("create")}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="py-2">
          <FormField label={t("nameLabel")} hint={t("nameHint")} error={error} required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={60}
              autoComplete="off"
              data-autofocus
            />
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
