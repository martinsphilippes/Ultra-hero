"use client";

import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { saveAgencyAction } from "@/app/admin/agencia/actions";
import { Button, FormField, Input, Select, useToast } from "@/components/ui";
import { slugFromName } from "@/lib/agency/schemas";

type Agency = { id: string | null; name: string; slug: string; status: string; contactEmail: string };

// Criar ou editar uma agência (admin geral).
export function AgencyForm({ initial }: { initial?: Agency }) {
  const t = useTranslations("adminAgency.form");
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [email, setEmail] = useState(initial?.contactEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = Boolean(initial?.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveAgencyAction({ id: initial?.id ?? null, name, slug: slug || slugFromName(name), status, contactEmail: email.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message, variant: "success" });
      if (!editing) window.location.reload();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("name")} required>
          <Input
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (!editing) setSlug(slugFromName(e.target.value));
            }}
            disabled={pending}
          />
        </FormField>
        <FormField label={t("slug")} required>
          <Input value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value.toLowerCase())} disabled={pending} className="font-mono" />
        </FormField>
        <FormField label={t("status")}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={pending}>
            <option value="active">{t("active")}</option>
            <option value="suspended">{t("suspended")}</option>
          </Select>
        </FormField>
        <FormField label={t("email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" leadingIcon={editing ? <Save /> : <Plus />} loading={pending} className="w-fit" disabled={!name.trim()}>
        {editing ? t("save") : t("create")}
      </Button>
    </form>
  );
}

// Ambiente de demonstração: cria ou restaura a agência demo e as contas de acesso rápido.
