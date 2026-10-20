import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/admin";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";

export type FulfillmentEvent = {
  id: number;
  from_status: string | null;
  to_status: string;
  actor_type: "consumer" | "creator" | "seller" | "admin" | "system";
  note: string | null;
  created_at: string;
};

// Linha do tempo de uma remessa simulada: status, quem agiu (rótulos traduzidos) e quando.
export async function OrderTimeline({ events, label }: { events: FulfillmentEvent[]; label: string }) {
  const [t, ts, locale] = await Promise.all([getTranslations("commerce.orders"), getTranslations("adminCommon.status"), getLocale()]);
  if (events.length === 0) return null;
  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-5" aria-label={label}>
      {events.map((event, index) => {
        const last = index === events.length - 1;
        const note = event.note && t.has(`eventNote.${event.note}`) ? t(`eventNote.${event.note}`) : event.note;
        return (
          <li key={event.id} className="relative">
            <span aria-hidden="true" className={`absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full border-2 border-surface ${last ? "bg-accent" : "bg-border-strong"}`} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={event.to_status} label={ts.has(event.to_status) ? ts(event.to_status) : event.to_status} />
              <span className="type-caption text-fg-muted">{t(`actor.${event.actor_type}`)}</span>
            </div>
            <p className="type-caption text-fg-muted">
              <time dateTime={event.created_at}>{formatDateTime(event.created_at, locale as Locale)}</time>
              {note ? ` · ${note}` : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
