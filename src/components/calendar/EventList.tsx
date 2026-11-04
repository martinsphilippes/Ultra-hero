import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { PlatformBadges, useCollectionLabel } from "@/components/platform-calendar/PlatformBadges";
import { Badge, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { eventDays, zonedDayKey } from "@/lib/calendar/grid";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { EventActions } from "./EventEditor";
import { KIND_VARIANT } from "./kinds";

/** Portais com agenda (0098: + admin, que vê o Calendário Groscove). */
export type AgendaPortal = "agency" | "brand" | "office" | "admin";

/** 0098: onde abre o detalhe de um evento do Calendário Groscove em cada portal. */
export const PLATFORM_DETAIL_BASE: Record<AgendaPortal, string> = {
  agency: "/agencia/agenda/groscove",
  brand: "/marca/agenda/groscove",
  office: "/heroi/agenda/groscove",
  admin: "/admin/agenda",
};

type Props = {
  events: CalendarEvent[];
  timeZone: string;
  /** Portal que está lendo: define links e ações. */
  portal: AgendaPortal;
  emptyTitle: string;
  emptyHint?: string;
  /** Sem os títulos de dia (a grade da agenda já mostra o dia escolhido). */
  flat?: boolean;
  /** 0094 (agenda do herói): conteúdo extra abaixo do item (checklist) e ações à direita (editar/excluir). */
  renderExtra?: (event: CalendarEvent) => ReactNode;
  renderActions?: (event: CalendarEvent) => ReactNode;
  /** Agenda do herói (campanha clicável): id do evento → tela que o cartão inteiro abre. Sem ele, nada muda. */
  ownHrefs?: Record<string, string>;
};

// Lista agrupada por dia (serve aos três portais): tipo, horário ou "dia inteiro", título, de quem é,
// local; na agência, link para o negócio e as ações (0086: editar e remover os manuais que a pessoa pode mexer,
// pelo EventEditorProvider da página; oportunidade de patrocínio abre a tela dela). Nunca valores.
export function EventList({ events, timeZone, portal, emptyTitle, emptyHint, flat = false, renderExtra, renderActions, ownHrefs }: Props) {
  const t = useTranslations("commercial.agenda");
  const tk = useTranslations("commercial.eventKinds");
  const tg = useTranslations("groscoveCalendar");
  const collectionLabel = useCollectionLabel();
  const locale = useLocale() as Locale;
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState icon={<CalendarDays />} title={emptyTitle} description={emptyHint} size="sm" />
      </div>
    );
  }
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = zonedDayKey(e.startsAt, timeZone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(e);
  }
  const timeOf = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const spanDays = (e: CalendarEvent) => eventDays(e, timeZone).length;
  const renderItem = (e: CalendarEvent) => (e.platform ? renderPlatform(e) : renderOwn(e));
  // 0098: evento do Calendário Groscove — faixa na cor da plataforma, selos (território, data a confirmar, destaque,
  // cancelado riscado), coleção/categoria, hashtags e o atalho para o detalhe (interesse, interessados)
  const renderPlatform = (e: CalendarEvent) => {
    const p = e.platform!;
    const cancelled = p.status === "cancelled";
    const href = `${PLATFORM_DETAIL_BASE[portal]}/${e.id}`;
    return (
      <li key={e.id} className="relative flex flex-wrap items-start gap-3 border-l-4 border-accent bg-accent-soft/40 p-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent-soft/70 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-focus" data-testid="event-item" data-kind={e.kind} data-platform="true" data-status={p.status}>
        <span className="w-24 shrink-0 font-mono text-sm text-fg-muted">
          {e.allDay ? t("allDay") : `${timeOf(e.startsAt)}${e.endsAt !== e.startsAt ? `–${timeOf(e.endsAt)}` : ""}`}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <PlatformBadges info={p} showStatus={portal === "admin"} />
          {/* o cartão inteiro abre o evento: o link do título se estende por cima do cartão (after:inset-0) */}
          <Link href={href} data-testid="platform-open" aria-label={tg("openLabel", { title: e.title })} className={`text-sm font-semibold text-fg underline-offset-2 outline-none after:absolute after:inset-0 after:content-[''] hover:underline ${cancelled ? "line-through decoration-2 opacity-70" : ""}`}>
            {e.title}
          </Link>
          {p.collection || p.category ? (
            <span className="type-caption text-fg-muted">{[p.collection ? collectionLabel(p.collection) : null, p.category].filter(Boolean).join(" · ")}</span>
          ) : null}
          {p.hashtags.length > 0 ? <span className="type-caption text-accent-text">{p.hashtags.map((h) => `#${h}`).join(" ")}</span> : null}
          {e.edgesOnly ? (
            <span className="type-caption text-fg-subtle">{tg("season", { start: formatDate(e.startsAt, locale, undefined, p.timezone), end: formatDate(new Date(new Date(e.endsAt).getTime() - 60_000), locale, undefined, p.timezone) })}</span>
          ) : spanDays(e) > 1 ? (
            <span className="type-caption text-fg-subtle">{t("until", { date: formatDate(new Date(new Date(e.endsAt).getTime() - 60_000), locale, undefined, timeZone) })}</span>
          ) : null}
        </span>
        <span className="inline-flex min-h-9 items-center gap-1 self-center text-sm font-medium text-fg-muted" aria-hidden="true">
          <span className="hidden sm:inline">{tg("open")}</span>
          <ChevronRight className="size-4" />
        </span>
      </li>
    );
  };
  // Agenda do herói: o cartão da campanha inteiro abre a tela dela (mesmo padrão do Calendário Groscove: o link do
  // título se estende por cima do cartão; ações e conteúdo extra ficam por cima dele com relative z-10)
  const renderOwn = (e: CalendarEvent) => {
    const href = portal === "agency" ? null : (ownHrefs?.[e.id] ?? null);
    return (
      <li
        key={e.id}
        className={href ? "relative flex flex-wrap items-start gap-3 p-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-focus" : "flex flex-wrap items-start gap-3 p-3"}
        data-testid="event-item"
        data-kind={e.kind}
        data-linked={href ? "true" : undefined}
      >
        <span className="w-24 shrink-0 font-mono text-sm text-fg-muted">
          {e.allDay ? t("allDay") : `${timeOf(e.startsAt)}${e.endsAt !== e.startsAt ? `–${timeOf(e.endsAt)}` : ""}`}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge size="sm" variant={KIND_VARIANT[e.kind]}>
              {tk(e.kind)}
            </Badge>
            {href ? (
              <Link href={href} data-testid="event-open" aria-label={t("openLabel", { title: e.title })} className="min-h-6 text-sm font-semibold text-fg underline-offset-2 outline-none after:absolute after:inset-0 after:content-[''] hover:underline">
                {e.title}
              </Link>
            ) : portal === "agency" && e.dealId ? (
              <Link href={`/agencia/negocios/${e.dealId}`} className="text-sm font-semibold text-fg underline-offset-2 hover:underline">
                {e.title}
              </Link>
            ) : e.brandCallId && portal === "agency" ? (
              // 0089: chamada da marca abre o pedido (a proposta da agência)
              <Link href={`/agencia/oportunidades/pedidos/${e.brandCallId}`} className="text-sm font-semibold text-fg underline-offset-2 hover:underline">
                {e.title}
              </Link>
            ) : e.sponsorshipId && portal !== "office" ? (
              // 0085: a oportunidade de patrocínio abre a ficha dela (agência) ou a resposta (marca)
              <Link
                href={`${portal === "agency" ? "/agencia" : "/marca"}/oportunidades/${e.sponsorshipId}`}
                className="text-sm font-semibold text-fg underline-offset-2 hover:underline"
              >
                {e.title}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-fg">{e.title}</span>
            )}
          </span>
          {e.subtitle ? <span className="type-caption text-fg-muted">{e.subtitle}</span> : null}
          {e.description ? <span className="whitespace-pre-wrap type-body-sm text-fg-muted">{e.description}</span> : null}
          {e.location ? (
            <span className="flex items-center gap-1 type-caption text-fg-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {e.location}
            </span>
          ) : null}
          {portal === "agency" ? (
            <span className="type-caption text-fg-subtle">
              {e.source === "system" ? t("system") : t("manual")}
              {e.visibleToBrand ? ` · ${t("visibleBrand")}` : ""}
              {e.visibleToTalent ? ` · ${t("visibleTalent")}` : ""}
            </span>
          ) : null}
          {/* bloco 9: evento de vários dias (aparece em cada dia da grade) diz até quando vai, nos três portais */}
          {spanDays(e) > 1 ? <span className="type-caption text-fg-subtle">{t("until", { date: formatDate(new Date(new Date(e.endsAt).getTime() - 60_000), locale, undefined, timeZone) })}</span> : null}
        </span>
        {portal === "agency" ? (
          <EventActions event={e} />
        ) : href ? (
          <>
            {renderActions ? <span className="relative z-10">{renderActions(e)}</span> : null}
            <ChevronRight className="size-4 self-center text-fg-muted" aria-hidden="true" />
          </>
        ) : (
          (renderActions?.(e) ?? null)
        )}
        {/* 0094: o que executar (checklist) ocupa a linha inteira, abaixo do horário, do título e das ações */}
        {renderExtra ? <div className={href ? "relative z-10 flex basis-full flex-col gap-1 empty:hidden" : "flex basis-full flex-col gap-1 empty:hidden"}>{renderExtra(e)}</div> : null}
      </li>
    );
  };
  if (flat) {
    return (
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="event-list">
        {events.map(renderItem)}
      </ul>
    );
  }
  return (
    <ol className="flex flex-col gap-4" data-testid="event-list">
      {Array.from(groups.entries()).map(([day, items]) => (
        <li key={day} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{formatDate(`${day}T12:00:00`, locale, { weekday: "long", day: "2-digit", month: "long" }, timeZone)}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {items.map(renderItem)}
          </ul>
        </li>
      ))}
    </ol>
  );
}
