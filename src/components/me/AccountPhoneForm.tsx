"use client";

import { Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateMyPhone } from "@/app/(app)/profile/account/actions";
import { Button, FormField, Input, useToast } from "@/components/ui";
import { formatBrPhoneInput } from "@/lib/auth/phone";

type Props = { initialPhone: string };

// Celular (opcional para quem entrou pelo Google): só o dono e a administração veem.
export function AccountPhoneForm({ initialPhone }: Props) {
  const t = useTranslations("me.account.phone");
  const { toast } = useToast();
  const [value, setValue] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateMyPhone({ phone: value });
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      toast({ title: t("saved"), variant: "success" });
    });
  }

  return (
    <section aria-labelledby="phone-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" data-testid="account-phone">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <Smartphone className="size-5" />
        </span>
        <h2 id="phone-title" className="type-h3 text-fg">
          {t("title")}
        </h2>
      </div>
      <form onSubmit={save} noValidate className="flex flex-col gap-3">
        <FormField label={t("label")} hint={t("hint")} error={error ?? undefined} optionalLabel={t("optional")}>
          <Input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 91234-5678" maxLength={22} value={value} onChange={(e) => setValue(formatBrPhoneInput(e.target.value))} />
        </FormField>
        <div>
          <Button type="submit" variant="secondary" loading={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
