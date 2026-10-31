import { Bell, Briefcase, CalendarDays, FileCheck2, Handshake, MessageSquare, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
};

// Tokens que os textos dos avisos podem usar: sempre presentes (vazio quando o aviso não traz).
const TOKENS = ["name", "brand", "deal", "talent", "step", "date", "status"] as const;

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
  return (
    <a
      href={item.link}
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
