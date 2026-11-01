"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createRetentionException, type RetentionExceptionValues } from "@/app/admin/ops-actions";
import { Button, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";

function defaultReviewDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// Cria uma exceção de retenção (escopo preservado da anonimização) com revisão obrigatória.
export function RetentionExceptionForm() {
  const t = useTranslations("adminOps.settings.retention");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const { toast } = useToast();
  // id único por instância: a mesma página pode ter vários diálogos (o botão do rodapé aponta pelo atributo form)
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<RetentionExceptionValues>({ scopeType: "user", scopeId: "", reason: "", ownerId: "", reviewAt: defaultReviewDate() });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof RetentionExceptionValues>(key: K, value: RetentionExceptionValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRetentionException(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message ?? t("created"), variant: "success" });
      setOpen(false);
      setValues({ scopeType: "user", scopeId: "", reason: "", ownerId: "", reviewAt: defaultReviewDate() });
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} leadingIcon={<Plus />}>
        {t("add")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={t("add")}
        description={t("description")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {tc("save")}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("scopeType")} required>
              <Select value={values.scopeType} disabled={pending} onChange={(e) => set("scopeType", e.target.value as "user" | "test_order")}>
                <option value="user">{t("scopeUser")}</option>
                <option value="test_order">{t("scopeTestOrder")}</option>
              </Select>
            </FormField>
            <FormField label={t("scopeId")} required>
              <Input value={values.scopeId} maxLength={120} className="font-mono" disabled={pending} onChange={(e) => set("scopeId", e.target.value)} />
            </FormField>
          </div>
          <FormField label={t("reason")} required>
            <Textarea value={values.reason} maxLength={1000} rows={3} disabled={pending} onChange={(e) => set("reason", e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("owner")} hint={t("ownerHint")}>
              <Input value={values.ownerId ?? ""} className="font-mono" disabled={pending} onChange={(e) => set("ownerId", e.target.value)} />
            </FormField>
            <FormField label={t("reviewAt")} required error={error ?? undefined}>
              <Input type="date" value={values.reviewAt} disabled={pending} onChange={(e) => set("reviewAt", e.target.value)} />
            </FormField>
          </div>
        </form>
      </Dialog>
    </>
  );
}
