"use client";

import { Bell, Briefcase, CalendarDays, FileCheck2, Handshake, Megaphone, MessageSquare, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { markReadAction } from "@/lib/inbox/actions";
import type { Locale } from "@/i18n/config";
import { formatRelativeTime } from "@/i18n/format";
import type { InboxItem } from "@/lib/inbox/queries";
import { cn } from "@/lib/utils";

const ICON: Partial<Record<string, LucideIcon>> = {
  member_joined: UserPlus,
  brand_member_joined: UserPlus,
  message_received: MessageSquare,
  briefing_received: Briefcase,
  deal_assigned: Briefcase,
  opportunity_received: Handshake,
  opportunity_updated: Handshake,
  opportunity_answered: Handshake,
  contract_acceptance_requested: FileCheck2,
  contract_confirmed: FileCheck2,
  calendar_event_added: CalendarDays,
  commercial_date_published: CalendarDays,
  payout_updated: Wallet,
  invoice_submitted: FileCheck2,
  invoice_reviewed: FileCheck2,
  payout_scheduled: Wallet,
  budget_exceeded: Wallet,
  usage_rights_expiring: CalendarDays,
  deliverable_comment: MessageSquare,
  task_due_soon: CalendarDays,
  sponsorship_published: Handshake,
  sponsorship_interest: Handshake,
  sponsorship_decided: Handshake,
  sponsorship_negotiation: Handshake,
  brand_call_published: Megaphone,
  brand_call_interest: Megaphone,
  brand_call_negotiation: Megaphone,
  brand_call_decided: Megaphone,
  brand_call_review: Megaphone,
  budget_change: Wallet,
  payment_reported: Wallet,
  payment_reviewed: Wallet,
  payment_due: Wallet,
  payment_plan: Wallet,
  roadmap_due_soon: CalendarDays,
  roadmap_overdue: CalendarDays,
};

// Tokens que os textos dos avisos podem usar: sempre presentes (vazio quando o aviso não traz).
const TOKENS = ["name", "brand", "deal", "talent", "step", "date", "status", "title"] as const;

export function inboxValues(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(TOKENS.map((k) => [k, params[k] ?? ""]));
}

type Props = { item: InboxItem; now?: Date };

// Um aviso: ícone do tipo, título e corpo no idioma de quem lê, quando chegou e o ponto de não lido.
export function InboxItemView({ item, now }: Props) {
  const t = useTranslations("inbox");
  const locale = useLocale() as Locale;
  const Icon = ICON[item.kind] ?? Bell;
  const values = inboxValues(item.params);
  const unread = !item.readAt;

  // Ao abrir o aviso ele conta como lido: marca antes de navegar (com limite de tempo para nunca prender o clique).
  // Ctrl/Cmd/botão do meio abrem em outra aba: o link segue o padrão e a marcação acontece em paralelo.
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!unread) return;
    const marking = markReadAction({ ids: [item.id] }).catch(() => null);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const go = () => window.location.assign(item.link);
    void Promise.race([marking, new Promise((resolve) => window.setTimeout(resolve, 1500))]).then(go, go);
  }

  return (
    <a
      href={item.link}
      onClick={open}
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
        unread && "bg-accent-soft/40",
      )}
      data-testid="inbox-item"
      data-unread={unread ? "true" : undefined}
    >
      <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-fg">{t(`kinds.${item.kind}.title`, values)}</span>
          {unread ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label={t("unreadDot")} /> : null}
        </span>
        <span className="type-body-sm text-fg-muted">{t(`kinds.${item.kind}.body`, values)}</span>
        <span className="type-caption text-fg-subtle">{formatRelativeTime(item.createdAt, locale, now)}</span>
      </span>
    </a>
  );
}
