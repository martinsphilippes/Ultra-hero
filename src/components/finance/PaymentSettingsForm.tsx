"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { savePaymentSettingsAction } from "@/lib/finance/payment-actions";
import { ACCOUNT_TYPES, PIX_KEY_TYPES, settingsProblem, settingsToDraft, type PaymentSettings, type SettingsDraft } from "@/lib/finance/payments";

// Dados de pagamento da agência (0090, só o Adm): PIX (tipo + chave) e/ou banco, favorecido e CPF/CNPJ. A marca vê
// estes dados em "Pagamentos" para pagar por fora do app — aqui nada cobra nem move dinheiro.
export function PaymentSettingsForm({ initial, locked = false }: { initial: PaymentSettings | null; locked?: boolean }) {
  const t = useTranslations("payments.settings");
  const { toast } = useToast();
  const [d, setD] = useState<SettingsDraft>(settingsToDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const patch = (p: Partial<SettingsDraft>) => setD((cur) => ({ ...cur, ...p }));
  const disabled = pending || locked;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = settingsProblem(d);
    if (problem) return setError(t(`errors.${problem}`));
    start(async () => {
      const r = await savePaymentSettingsAction(d);
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="payment-settings-form">
      <fieldset className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <legend className="mb-2 text-sm font-semibold text-fg">{t("pixTitle")}</legend>
        <FormField label={t("pixType")}>
          <Select value={d.pixKeyType} onChange={(e) => patch({ pixKeyType: e.target.value as SettingsDraft["pixKeyType"] })} disabled={disabled}>
            <option value="">{t("noPix")}</option>
            {PIX_KEY_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`pixTypes.${k}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("pixKey")} hint={d.pixKeyType ? t(`pixHints.${d.pixKeyType}`) : undefined}>
          <Input value={d.pixKey} onChange={(e) => patch({ pixKey: e.target.value })} maxLength={120} disabled={disabled || !d.pixKeyType} autoComplete="off" />
        </FormField>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-fg">{t("bankTitle")}</legend>
        <FormField label={t("bankName")} className="sm:col-span-2">
          <Input value={d.bankName} onChange={(e) => patch({ bankName: e.target.value })} maxLength={80} disabled={disabled} placeholder={t("bankNamePlaceholder")} />
        </FormField>
        <FormField label={t("branch")}>
          <Input value={d.bankBranch} onChange={(e) => patch({ bankBranch: e.target.value })} maxLength={8} inputMode="numeric" disabled={disabled} />
        </FormField>
        <FormField label={t("account")}>
          <Input value={d.bankAccount} onChange={(e) => patch({ bankAccount: e.target.value })} maxLength={18} disabled={disabled} placeholder="12345-6" />
        </FormField>
        <FormField label={t("accountType")} className="sm:col-span-2">
          <Select value={d.bankAccountType} onChange={(e) => patch({ bankAccountType: e.target.value as SettingsDraft["bankAccountType"] })} disabled={disabled}>
            {ACCOUNT_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`accountTypes.${k}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-fg">{t("holderTitle")}</legend>
        <FormField label={t("holder")} required>
          <Input value={d.holderName} onChange={(e) => patch({ holderName: e.target.value })} maxLength={120} disabled={disabled} />
        </FormField>
        <FormField label={t("taxId")} hint={t("taxIdHint")} required>
          <Input value={d.holderTaxId} onChange={(e) => patch({ holderTaxId: e.target.value })} maxLength={20} disabled={disabled} autoComplete="off" />
        </FormField>
        <FormField label={t("instructions")} hint={t("instructionsHint")} className="sm:col-span-2">
          <Textarea value={d.instructions} onChange={(e) => patch({ instructions: e.target.value })} rows={2} maxLength={300} disabled={disabled} />
        </FormField>
      </fieldset>
      {error ? (
        <p className="type-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <p className="type-caption text-fg-muted">{t("simulated")}</p>
      <Button type="submit" leadingIcon={<Save />} loading={pending} disabled={locked} className="w-full sm:w-fit" data-testid="payment-settings-save">
        {t("save")}
      </Button>
    </form>
  );
}
