"use client";

import { CalendarDays, Clock, MapPin, Target, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PublicChips } from "@/components/sponsorship/NegotiationView";
import { Badge, Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { callInterestAction } from "@/lib/brand-call/actions";
import type { BrandCall } from "@/lib/brand-call/logic";
import { BudgetText, DeliverablesText } from "./shared";

type Props = {
  call: BrandCall;
  /** marca e Adm da agência leem a verba; os outros veem "a combinar" / "visível só ao Adm"; o creator não vê a linha */
  budget: "values" | "masked" | "none";
  showBrand?: boolean;
};

// Resumo da chamada da marca (0089): a necessidade, o período, o local, o público, as entregas, quantos creators,
// nichos, redes, a verba (conforme quem lê) e o prazo para propostas. Serve à marca, à agência e ao creator.
export function CallSummary({ call, budget, showBrand = false }: Props) {
  const t = useTranslations("brandCall.summary");
  const to = useTranslations("commercial.objectives");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const period = call.endsOn && call.endsOn !== call.startsOn ? `${formatPlainDate(call.startsOn, locale)} – ${formatPlainDate(call.endsOn, locale)}` : formatPlainDate(call.startsOn, locale);
  const row = "flex items-start gap-2 type-body-sm text-fg";
  const icon = "mt-0.5 size-4 shrink-0 text-fg-muted";
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="call-summary">
      {showBrand ? <span className="type-caption font-medium text-accent-text">{call.brandName}</span> : null}
      {call.objective ? (
        <span className={row}>
          <Target className={icon} aria-hidden="true" />
          {t("objective", { value: to(call.objective) })}
        </span>
      ) : null}
      {call.description ? <p className="whitespace-pre-wrap type-body-sm text-fg">{call.description}</p> : null}
      <span className={row}>
        <CalendarDays className={icon} aria-hidden="true" />
        {t("period", { value: period })}
      </span>
      {call.location ? (
        <span className={row}>
          <MapPin className={icon} aria-hidden="true" />
          {call.location}
        </span>
      ) : null}
      {call.respondBy ? (
        <span className={row}>
          <Clock className={icon} aria-hidden="true" />
          {t("respondBy", { date: formatDateTime(call.respondBy, locale) })}
        </span>
      ) : null}
      <span className={row}>
        <Users className={icon} aria-hidden="true" />
        {t("creatorsWanted", { count: call.creatorsWanted })}
      </span>
      <div className="flex flex-col gap-1">
        <span className="type-caption text-fg-muted">{t("deliverables")}</span>
        <DeliverablesText items={call.deliverables} />
      </div>
      {call.networks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-caption text-fg-muted">{t("networks")}:</span>
          {call.networks.map((n) => (
            <Badge key={n} size="sm" variant="neutral">
              {tn(n)}
            </Badge>
          ))}
        </div>
      ) : null}
      {call.niches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-caption text-fg-muted">{t("niches")}:</span>
          {call.niches.map((n) => (
            <Badge key={n} size="sm" variant="info">
              {n}
            </Badge>
          ))}
        </div>
      ) : null}
      <PublicChips value={call.public} label={t("public")} />
      {budget !== "none" ? (
        <div className="flex flex-col gap-0.5 border-t border-border pt-3">
          <span className="type-caption text-fg-muted">{t("budget")}</span>
          <span className="text-base font-semibold text-fg">
            <BudgetText display={call.budgetDisplay} cents={call.budgetCents} canValues={budget === "values"} />
          </span>
          {budget === "values" && call.budgetDisplay !== "open" ? <span className="type-caption text-fg-muted">{t(`budgetShown.${call.budgetDisplay}`)}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

/** "Tenho interesse" do creator: mensagem curta para a agência dele (a marca não recebe). */
export function TalentInterestButton({ callId, current }: { callId: string; current: string | null }) {
  const t = useTranslations("brandCall.talent");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function send() {
    setError(null);
    start(async () => {
      const result = await callInterestAction({ callId, message });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(false);
      router.refresh();
    });
  }
  return (
    <>
      <Button type="button" size="md" variant={current !== null ? "secondary" : "primary"} onClick={() => setOpen(true)} data-testid="call-interest">
        {current !== null ? t("editInterest") : t("interest")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogHint")}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" onClick={send} disabled={pending} data-testid="call-interest-send">
              {t("send")}
            </Button>
          </div>
        }
      >
        <FormField label={t("message")}>
          <Textarea value={message} maxLength={300} rows={3} placeholder={t("messagePlaceholder")} onChange={(e) => setMessage(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
