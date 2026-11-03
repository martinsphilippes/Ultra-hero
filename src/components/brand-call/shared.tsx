"use client";

import { Building2, Plus, Store, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, DatePicker, FormField, Input, MoneyInput, Select, Textarea, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import type { AgencyViewStatus, CallRound, CallStatus } from "@/lib/brand-call/logic";
import type { RequestDeliverable } from "@/lib/deals/schemas";
import { formatCents } from "@/lib/deals/schemas";
import { DELIVERABLE_KINDS } from "@/lib/deals/vocab";
import { NETWORKS } from "@/lib/talent/vocab";

// Peças da chamada da marca (0089) que servem à marca, à agência e ao creator: selos de situação, entregas em texto e
// o editor de entregas (mesmos campos da campanha), o compositor de termos de uma rodada e a linha do tempo.

const CALL_VARIANT: Record<CallStatus, BadgeVariant> = { draft: "neutral", open: "success", closed: "neutral", contracted: "accent", cancelled: "neutral" };
const AGENCY_VARIANT: Record<AgencyViewStatus, BadgeVariant> = { open: "success", expired: "warning", won: "accent", lost: "neutral", closed: "neutral", cancelled: "neutral" };

export function CallStatusBadge({ status, closedReason }: { status: CallStatus; closedReason?: "deadline" | "decision" | null }) {
  const t = useTranslations("brandCall.status");
  return (
    <Badge size="sm" variant={CALL_VARIANT[status]} data-testid="call-status" data-status={status}>
      {status === "closed" && closedReason === "deadline" ? t("closedDeadline") : t(status)}
    </Badge>
  );
}

export function AgencyCallStatusBadge({ status }: { status: AgencyViewStatus }) {
  const t = useTranslations("brandCall.agencyStatus");
  return (
    <Badge size="sm" variant={AGENCY_VARIANT[status]} data-testid="call-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}

/** "2 Reels (Instagram) · 5 Stories (Instagram)" */
export function DeliverablesText({ items, className }: { items: RequestDeliverable[]; className?: string }) {
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  if (items.length === 0) return <span className={className ?? "type-body-sm text-fg-muted"}>—</span>;
  return (
    <span className={className ?? "type-body-sm text-fg"} data-testid="deliverables-text">
      {items.map((d) => `${d.quantity} ${tk(d.kind)}${d.network ? ` (${tn(d.network)})` : ""}`).join(" · ")}
    </span>
  );
}

type EditorProps = { value: RequestDeliverable[]; onChange: (next: RequestDeliverable[]) => void; disabled?: boolean; idPrefix: string };

/** Lista de entregas (tipo + quantidade + rede), os mesmos campos e textos da campanha. */
export function DeliverablesEditor({ value, onChange, disabled = false, idPrefix }: EditorProps) {
  const t = useTranslations("brandPortal.campaigns.form");
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  const patch = (i: number, p: Partial<RequestDeliverable>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="flex flex-col gap-2" data-testid={`${idPrefix}-deliverables`}>
      {value.length === 0 ? <p className="type-body-sm text-fg-muted">{t("deliverablesEmpty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {value.map((d, i) => (
          <li key={i} className="grid grid-cols-[1fr_5rem] gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_5rem_1fr_auto] sm:items-end">
            <FormField label={t("deliverableKind")}>
              <Select value={d.kind} onChange={(e) => patch(i, { kind: e.target.value as RequestDeliverable["kind"] })} disabled={disabled}>
                {DELIVERABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {tk(k)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("quantity")}>
              <Input type="number" inputMode="numeric" min={1} max={100} value={String(d.quantity)} onChange={(e) => patch(i, { quantity: Math.max(1, Math.min(100, Math.trunc(Number(e.target.value)) || 1)) })} disabled={disabled} />
            </FormField>
            <FormField label={t("deliverableNetwork")} className="col-span-2 sm:col-span-1">
              <Select value={d.network ?? ""} onChange={(e) => patch(i, { network: (e.target.value || null) as RequestDeliverable["network"] })} disabled={disabled}>
                <option value="">—</option>
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {tn(n)}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} className="col-span-2 justify-self-start sm:col-span-1" onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={disabled} aria-label={t("removeDeliverable", { n: i + 1 })}>
              <span className="sr-only sm:not-sr-only">{t("remove")}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => onChange([...value, { kind: "reels", quantity: 1, network: null }])} disabled={disabled || value.length >= 30} className="w-fit">
        {t("addDeliverable")}
      </Button>
    </div>
  );
}

export type TermsDraft = { amountText: string; deliverables: RequestDeliverable[]; deliverBy: string; note: string };

/** Termos de uma rodada (contraproposta): valor total, entregas, prazo de entrega e nota. */
export function TermsFields({ value, onChange, disabled, idPrefix }: { value: TermsDraft; onChange: (v: TermsDraft) => void; disabled?: boolean; idPrefix: string }) {
  const t = useTranslations("brandCall.negotiation");
  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-terms`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("amount")} required>
          <MoneyInput value={value.amountText} maxCents={10_000_000_000} onValueChange={(text) => onChange({ ...value, amountText: text })} disabled={disabled} data-testid={`${idPrefix}-amount`} />
        </FormField>
        <FormField label={t("deliverBy")}>
          <DatePicker value={value.deliverBy} onChange={(v) => onChange({ ...value, deliverBy: v })} disabled={disabled} />
        </FormField>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-fg">{t("deliverables")}</legend>
        <DeliverablesEditor idPrefix={idPrefix} value={value.deliverables} onChange={(d) => onChange({ ...value, deliverables: d })} disabled={disabled} />
      </fieldset>
      <FormField label={t("note")}>
        <Textarea value={value.note} maxLength={500} rows={2} onChange={(e) => onChange({ ...value, note: e.target.value })} disabled={disabled} />
      </FormField>
    </div>
  );
}

/** Linha do tempo das rodadas: quem, quando, valor (só para quem lê), entregas, prazo e nota. */
export function CallTimeline({ rounds, viewer, agencyName, brandName }: { rounds: CallRound[]; viewer: "brand" | "agency"; agencyName?: string; brandName?: string }) {
  const t = useTranslations("brandCall.negotiation");
  const locale = useLocale() as Locale;
  if (rounds.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-border pl-4" data-testid="call-timeline">
      {rounds.map((r) => {
        const SideIcon = r.side === "agency" ? Building2 : Store;
        const who = r.side === "agency" ? (agencyName ?? t("sideAgency")) : (brandName ?? t("sideBrand"));
        return (
          <li key={r.id} className="relative flex flex-col gap-1" data-testid="call-round" data-action={r.action} data-state={r.state}>
            <span className="absolute -left-[1.42rem] top-1 flex size-5 items-center justify-center rounded-full border border-border bg-surface">
              <SideIcon className="size-3 text-accent-text" aria-hidden="true" />
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{t(`action.${r.action}`)}</span>
              {r.state !== "sent" ? (
                <Badge size="sm" variant={r.state === "pending_owner" ? "warning" : "neutral"}>
                  {t(`roundState.${r.state}`)}
                </Badge>
              ) : null}
            </span>
            <span className="type-caption text-fg-muted">
              {who}
              {r.actorLabel ? ` · ${r.actorLabel}` : ""} · {formatDateTime(r.createdAt, locale)}
            </span>
            {r.amountCents !== null ? <span className="text-sm font-semibold text-fg">{formatCents(r.amountCents, locale)}</span> : null}
            {r.deliverables && r.action !== "accept" ? <DeliverablesText items={r.deliverables} className="type-caption text-fg" /> : null}
            {r.deliverBy && r.action !== "accept" ? <span className="type-caption text-fg-muted">{t("deliverByValue", { date: formatPlainDate(r.deliverBy, locale) })}</span> : null}
            {r.note ? <p className="whitespace-pre-wrap type-body-sm text-fg">“{r.note}”</p> : null}
            {r.reviewedAt && viewer === "brand" ? (
              <span className="type-caption text-fg-muted">
                {t(r.state === "returned" ? "returnedBy" : "approvedBy", { name: r.reviewedLabel || "—", date: formatDateTime(r.reviewedAt, locale) })}
                {r.reviewNote ? ` · “${r.reviewNote}”` : ""}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Verba como texto, conforme quem lê. */
export function BudgetText({ display, cents, canValues }: { display: "exact" | "up_to" | "open"; cents: number | null; canValues: boolean }) {
  const t = useTranslations("brandCall.budget");
  const locale = useLocale() as Locale;
  if (display === "open") return <span data-testid="call-budget">{t("open")}</span>;
  if (!canValues || cents === null) return <span data-testid="call-budget">{t("hidden")}</span>;
  return <span data-testid="call-budget">{display === "up_to" ? t("upTo", { amount: formatCents(cents, locale) }) : formatCents(cents, locale)}</span>;
}
