"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, DatePicker, Dialog, FormField, Input, MoneyInput, Select, Textarea, useToast } from "@/components/ui";
import { saveHeroServiceAction } from "@/lib/hero-work/actions";
import { HERO_SERVICE_STATUSES, MAX_SERVICE_CENTS, type HeroServiceInput, type HeroServiceStatus } from "@/lib/hero-work/vocab";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; initial: HeroServiceInput & { amountText: string }; today: string };

// Serviço e ganho: título, quem contratou, data do serviço, valor a receber (MoneyInput), vencimento, situação
// (a receber | recebido | cancelado; "vencido" é calculado pelo vencimento), data de recebimento e forma/observação.
// O comprovante é anexado na lista (depois de salvar). Registro simulado: nada é cobrado nem pago por aqui.
export function HeroServiceDialog({ open, onOpenChange, initial, today }: Props) {
  const t = useTranslations("heroWork.finance.form");
  const ts = useTranslations("heroWork.finance.status");
  const { toast } = useToast();
  const [v, setV] = useState<HeroServiceInput>(initial);
  const [amountText, setAmountText] = useState(initial.amountText);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof HeroServiceInput>(k: K, value: HeroServiceInput[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const editing = Boolean(initial.id);

  function changeStatus(status: HeroServiceStatus) {
    // recebido leva a data (hoje, se ainda não havia); os outros estados não guardam
    setV((cur) => ({ ...cur, status, receivedOn: status === "received" ? cur.receivedOn || today : "" }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!v.title.trim()) return setError(t("titleRequired"));
    if (!v.client.trim()) return setError(t("clientRequired"));
    if (!v.serviceOn) return setError(t("dateRequired"));
    start(async () => {
      const result = await saveHeroServiceAction(v);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? t("editTitle") : t("title")} description={t("hint")} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="hero-service-form" data-mode={editing ? "edit" : "new"}>
        <FormField label={t("serviceTitle")} required>
          <Input value={v.title} maxLength={160} onChange={(e) => set("title", e.target.value)} disabled={pending} data-testid="hero-service-title" />
        </FormField>
        <FormField label={t("client")} hint={t("clientHint")} required>
          <Input value={v.client} maxLength={120} onChange={(e) => set("client", e.target.value)} disabled={pending} data-testid="hero-service-client" />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("serviceOn")} required>
            <DatePicker value={v.serviceOn} onChange={(value) => set("serviceOn", value)} disabled={pending} required data-testid="hero-service-date" />
          </FormField>
          <FormField label={t("amount")} hint={t("amountHint")} required>
            <MoneyInput
              value={amountText}
              maxCents={MAX_SERVICE_CENTS}
              onValueChange={(text, cents) => {
                setAmountText(text);
                set("amountCents", cents ?? 0);
              }}
              disabled={pending}
              data-testid="hero-service-amount"
            />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("dueOn")} hint={t("dueOnHint")}>
            <DatePicker value={v.dueOn} onChange={(value) => set("dueOn", value)} disabled={pending} data-testid="hero-service-due" />
          </FormField>
          <FormField label={t("status")}>
            <Select value={v.status} onChange={(e) => changeStatus(e.target.value as HeroServiceStatus)} disabled={pending} data-testid="hero-service-status">
              {HERO_SERVICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ts(s)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {v.status === "received" ? (
          <FormField label={t("receivedOn")} required>
            <DatePicker value={v.receivedOn} onChange={(value) => set("receivedOn", value)} disabled={pending} required data-testid="hero-service-received" />
          </FormField>
        ) : null}
        <FormField label={t("paymentNote")} hint={t("paymentNoteHint")}>
          <Textarea value={v.paymentNote} maxLength={500} rows={2} onChange={(e) => set("paymentNote", e.target.value)} disabled={pending} />
        </FormField>
        <p className="type-caption text-fg-muted">{t("simulated")}</p>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="hero-service-save">
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
