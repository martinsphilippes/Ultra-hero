"use client";

import { CheckCircle2, Eye, FilePlus2, FileUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef, useState, useTransition } from "react";
import { Badge, Button, DatePicker, Dialog, EmptyState, FormField, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import {
  deleteHeroServiceAction,
  markServiceReceivedAction,
  proofUrlAction,
  removeServiceProofAction,
  setServiceProofAction,
} from "@/lib/hero-work/actions";
import { daysOverdue, effectiveStatus, financeSummary, groupServices, SERVICE_GROUP_ORDER, type HeroService } from "@/lib/hero-work/finance";
import { isProofPath, PROOF_MAX_BYTES, PROOF_MIME_TYPES, proofExtension, type HeroServiceInput, type HeroServiceView } from "@/lib/hero-work/vocab";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { HeroMoney } from "./HeroMoney";
import { HeroServiceDialog } from "./HeroServiceDialog";

type Props = { creatorId: string; services: HeroService[]; today: string; canWrite: boolean };

const VIEW_VARIANT: Record<HeroServiceView, BadgeVariant> = { overdue: "danger", receivable: "warning", received: "success", cancelled: "neutral" };

const centsToText = (cents: number) => (cents === 0 ? "" : (cents / 100).toFixed(2).replace(".", ","));

// "Serviços e ganhos" do herói independente: painel (a receber, vencidos, recebido no mês, previsão 30/60/90 dias) e a
// lista por serviço com a situação, "marcar como recebido" (com a data) e o comprovante opcional (bucket privado
// hero-proofs, só o titular). Registro simulado: nada é cobrado nem pago por aqui. O app das lojas esconde os valores.
export function HeroFinance({ creatorId, services, today, canWrite }: Props) {
  const t = useTranslations("heroWork.finance");
  const ts = useTranslations("heroWork.finance.status");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [initial, setInitial] = useState<HeroServiceInput & { amountText: string }>(() => blank(creatorId, today));
  const [receiving, setReceiving] = useState<HeroService | null>(null);
  const [receivedOn, setReceivedOn] = useState(today);
  const [pending, start] = useTransition();

  const summary = financeSummary(services, today);
  const groups = groupServices(services, today);
  const day = (d: string) => formatPlainDate(d, locale);

  const openNew = useCallback(() => {
    setInitial(blank(creatorId, today));
    setVersion((n) => n + 1);
    setOpen(true);
  }, [creatorId, today]);

  function openEdit(s: HeroService) {
    setInitial({
      id: s.id,
      creatorId: s.creatorId,
      title: s.title,
      client: s.client,
      serviceOn: s.serviceOn,
      amountCents: s.amountCents,
      amountText: centsToText(s.amountCents),
      dueOn: s.dueOn ?? "",
      status: s.status,
      receivedOn: s.receivedOn ?? "",
      paymentNote: s.paymentNote,
    });
    setVersion((n) => n + 1);
    setOpen(true);
  }

  function remove(s: HeroService) {
    if (!window.confirm(t("confirmDelete", { title: s.title }))) return;
    start(async () => {
      const result = await deleteHeroServiceAction({ id: s.id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  function confirmReceived() {
    if (!receiving || !receivedOn) return;
    const id = receiving.id;
    start(async () => {
      const result = await markServiceReceivedAction({ id, receivedOn });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (result.ok) setReceiving(null);
    });
  }

  const cards: { key: "receivable" | "overdue" | "receivedMonth"; cents: number; count: number; tone: string }[] = [
    { key: "receivable", cents: summary.receivableCents, count: summary.receivableCount, tone: "text-fg" },
    { key: "overdue", cents: summary.overdueCents, count: summary.overdueCount, tone: summary.overdueCount > 0 ? "text-danger" : "text-fg" },
    { key: "receivedMonth", cents: summary.receivedMonthCents, count: summary.receivedMonthCount, tone: "text-success" },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="hero-finance">
      {canWrite ? (
        <Button type="button" size="lg" leadingIcon={<Plus />} onClick={openNew} className="w-full sm:w-fit" data-testid="hero-service-new">
          {t("new")}
        </Button>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="hero-finance-totals">
        {cards.map((c) => (
          <div key={c.key} className="flex min-h-20 flex-col justify-center gap-0.5 rounded-2xl border border-border bg-surface p-4" data-card={c.key}>
            <span className="type-caption font-semibold uppercase tracking-wider text-fg-muted">{t(`cards.${c.key}`)}</span>
            <HeroMoney cents={c.cents} locale={locale} className={cn("font-mono text-xl font-semibold", c.tone)} />
            <span className="type-caption text-fg-muted">
              {t(`cardHints.${c.key}`)} · {t("count", { count: c.count })}
            </span>
          </div>
        ))}
      </div>
      <p className="type-caption hidden text-fg-muted native:block">{t("appHint")}</p>

      <section aria-labelledby="hero-forecast" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="hero-forecast">
        <h2 id="hero-forecast" className="text-sm font-semibold text-fg">
          {t("forecast.title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("forecast.hint")}</p>
        <dl className="grid grid-cols-3 gap-2">
          {(["d30", "d60", "d90"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-xl bg-surface-elevated p-3" data-window={k}>
              <dt className="type-caption text-fg-muted">{t(`forecast.${k}`)}</dt>
              <dd>
                <HeroMoney cents={summary.forecast[k]} locale={locale} className="font-mono text-sm font-semibold text-fg" />
              </dd>
            </div>
          ))}
        </dl>
        {summary.forecast.noDueCount > 0 ? (
          <p className="type-caption text-fg-muted">
            {t("forecast.noDue", { count: summary.forecast.noDueCount })} <HeroMoney cents={summary.forecast.noDueCents} locale={locale} />
          </p>
        ) : null}
      </section>

      {services.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState title={t("empty")} description={canWrite ? t("emptyHint") : undefined} size="sm" />
        </div>
      ) : (
        SERVICE_GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => (
          <section key={g} aria-labelledby={`hero-group-${g}`} className="flex flex-col gap-2" data-testid={`hero-group-${g}`}>
            <h2 id={`hero-group-${g}`} className="text-sm font-semibold text-fg">
              {t(`groups.${g}`)} · {groups[g].length}
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
              {groups[g].map((s) => {
                const view = effectiveStatus(s, today);
                const late = daysOverdue(s, today);
                return (
                  <li key={s.id} className="flex flex-col gap-2 p-3" data-testid="hero-service-item" data-status={view}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge size="sm" variant={VIEW_VARIANT[view]}>
                            {ts(view)}
                          </Badge>
                          <span className="text-sm font-semibold text-fg">{s.title}</span>
                        </span>
                        <span className="type-caption text-fg-muted">
                          {t("item.hiredBy", { client: s.client })} · {t("item.serviceOn", { date: day(s.serviceOn) })}
                        </span>
                        <span className="type-caption text-fg-muted">
                          {view === "received" && s.receivedOn
                            ? t("item.receivedOn", { date: day(s.receivedOn) })
                            : s.dueOn
                              ? t("item.dueOn", { date: day(s.dueOn) })
                              : t("item.noDue")}
                          {view === "overdue" ? ` · ${t("item.late", { count: late })}` : ""}
                        </span>
                        {s.paymentNote ? <span className="type-caption text-fg-muted">{s.paymentNote}</span> : null}
                      </div>
                      <HeroMoney cents={s.amountCents} locale={locale} className="shrink-0 font-mono text-base font-semibold text-fg" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canWrite && (view === "receivable" || view === "overdue") ? (
                        <Button type="button" size="sm" leadingIcon={<CheckCircle2 />} onClick={() => { setReceivedOn(today); setReceiving(s); }} data-testid="hero-service-receive">
                          {t("item.markReceived")}
                        </Button>
                      ) : null}
                      <ProofControls service={s} canWrite={canWrite} />
                      {canWrite ? (
                        <>
                          <Button type="button" size="sm" variant="ghost" leadingIcon={<Pencil />} onClick={() => openEdit(s)} aria-label={t("item.editLabel", { title: s.title })} data-testid="hero-service-edit">
                            <span className="sr-only sm:not-sr-only">{t("item.edit")}</span>
                          </Button>
                          <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => remove(s)} disabled={pending} aria-label={t("item.deleteLabel", { title: s.title })} data-testid="hero-service-delete">
                            <span className="sr-only sm:not-sr-only">{t("item.delete")}</span>
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="type-caption text-fg-muted" data-testid="hero-finance-simulated">
        {t("simulated")}
      </p>

      {canWrite ? <HeroServiceDialog key={version} open={open} onOpenChange={setOpen} initial={initial} today={today} /> : null}

      <Dialog open={receiving !== null} onOpenChange={(o) => !o && setReceiving(null)} title={t("receive.title")} description={receiving ? t("receive.hint", { title: receiving.title }) : undefined} size="sm">
        <div className="flex flex-col gap-3" data-testid="hero-receive-dialog">
          <FormField label={t("receive.date")} required>
            <DatePicker value={receivedOn} onChange={setReceivedOn} required max={today} data-testid="hero-receive-date" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReceiving(null)} disabled={pending}>
              {t("receive.back")}
            </Button>
            <Button type="button" onClick={confirmReceived} loading={pending} disabled={!receivedOn} data-testid="hero-receive-confirm">
              {t("receive.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function blank(creatorId: string, today: string): HeroServiceInput & { amountText: string } {
  return { id: null, creatorId, title: "", client: "", serviceOn: today, amountCents: 0, amountText: "", dueOn: "", status: "receivable", receivedOn: "", paymentNote: "" };
}

// Comprovante opcional: anexar (envio direto ao bucket privado hero-proofs, caminho <herói>/<serviço>/<arquivo>), abrir
// por endereço assinado de 60 s e remover. Só o titular.
function ProofControls({ service, canWrite }: { service: HeroService; canWrite: boolean }) {
  const t = useTranslations("heroWork.finance.proof");
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onPick() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const ext = proofExtension(file.type);
    if (!ext || !(PROOF_MIME_TYPES as readonly string[]).includes(file.type)) return toast({ title: t("badType"), variant: "error" });
    if (file.size < 1 || file.size > PROOF_MAX_BYTES) return toast({ title: t("tooLarge"), variant: "error" });
    const path = `${service.creatorId}/${service.id}/${crypto.randomUUID()}.${ext}`;
    if (!isProofPath(path, service.creatorId, service.id)) return toast({ title: t("uploadFailed"), variant: "error" });
    start(async () => {
      const { error } = await createClient().storage.from("hero-proofs").upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        toast({ title: t("uploadFailed"), variant: "error" });
        return;
      }
      const result = await setServiceProofAction({ id: service.id, creatorId: service.creatorId, path, mime: file.type });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function view() {
    start(async () => {
      const result = await proofUrlAction({ id: service.id });
      if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else toast({ title: result.ok ? t("uploadFailed") : result.error, variant: "error" });
    });
  }

  function remove() {
    if (!window.confirm(t("confirmRemove"))) return;
    start(async () => {
      const result = await removeServiceProofAction({ id: service.id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  if (!service.proofPath && !canWrite) return null;
  return (
    <>
      {service.proofPath ? (
        <>
          <Button type="button" size="sm" variant="secondary" leadingIcon={<Eye />} onClick={view} disabled={pending} data-testid="hero-proof-view">
            {t("view")}
          </Button>
          {canWrite ? (
            <Button type="button" size="sm" variant="ghost" leadingIcon={<X />} onClick={remove} disabled={pending} aria-label={t("removeLabel", { title: service.title })}>
              <span className="sr-only sm:not-sr-only">{t("remove")}</span>
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <input ref={fileRef} type="file" accept={PROOF_MIME_TYPES.join(",")} onChange={onPick} className="sr-only" id={`proof-${service.id}`} data-testid="hero-proof-file" />
          <Button type="button" size="sm" variant="secondary" leadingIcon={pending ? <FileUp /> : <FilePlus2 />} onClick={() => fileRef.current?.click()} loading={pending} data-testid="hero-proof-attach">
            {t("attach")}
          </Button>
        </>
      )}
    </>
  );
}
