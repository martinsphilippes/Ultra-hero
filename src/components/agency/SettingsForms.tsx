"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { saveSettingsAction, updateSelfAction } from "@/app/agencia/configuracoes/actions";
import { Button, FormField, Input, Select, useToast } from "@/components/ui";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife", "America/Belem", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "Europe/Lisbon", "UTC"];

type Settings = { name: string; timezone: string; relationshipAlertDays: number; contactEmail: string | null };

// Dados da agência (gestor+): nome, fuso, dias sem contato para o alerta de relacionamento e e-mail.
export function AgencySettingsForm({ initial }: { initial: Settings }) {
  const t = useTranslations("agency.settings");
  const { toast } = useToast();
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [days, setDays] = useState(String(initial.relationshipAlertDays));
  const [email, setEmail] = useState(initial.contactEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const zones = TIMEZONES.includes(initial.timezone) ? TIMEZONES : [initial.timezone, ...TIMEZONES];

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveSettingsAction({ name, timezone, relationshipAlertDays: days, contactEmail: email.trim() });
      if (!result.ok) setError(result.error);
      else toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="agency-settings-form">
      <FormField label={t("name")} required>
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={pending} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("timezone")} required>
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={pending}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("alertDays")} hint={t("alertDaysHint")} required>
          <Input type="number" inputMode="numeric" min={7} max={365} value={days} onChange={(e) => setDays(e.target.value)} disabled={pending} />
        </FormField>
      </div>
      <FormField label={t("contactEmail")} hint={t("contactEmailHint")}>
        <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-fit">
        {t("save")}
      </Button>
    </form>
  );
}

// Nome e cargo com que a própria pessoa aparece para a equipe (qualquer membro).
export function SelfForm({ initialName, initialTitle }: { initialName: string; initialTitle: string }) {
  const t = useTranslations("agency.settings");
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start(async () => {
          const result = await updateSelfAction({ displayName: name, jobTitle: title });
          if (!result.ok) setError(result.error);
          else toast({ title: result.message, variant: "success" });
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("selfName")} required>
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("selfTitle")}>
          <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" leadingIcon={<Save />} loading={pending} className="w-fit">
        {t("selfSave")}
      </Button>
    </form>
  );
}
