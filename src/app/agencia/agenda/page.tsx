import type { Metadata } from "next";
import { CalendarDays, Handshake } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { EventEditorProvider, EventNewButton } from "@/components/calendar/EventEditor";
import { FeedCard } from "@/components/calendar/FeedCard";
import { Button, EmptyState, EntitySelect, PageHeader, Select } from "@/components/ui";
import { listAgencyBrands } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { getUser } from "@/lib/auth/session";
import { queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { monthKey, parseMonth, plusDays } from "@/lib/calendar/ics";
import { listEvents, myFeedState, writableDealIds, type CalendarEvent } from "@/lib/calendar/queries";
import { EVENT_KINDS } from "@/lib/calendar/vocab";
import { listAgencyBrandCalls } from "@/lib/brand-call/queries";
import { listDeals } from "@/lib/deals/queries";
import { toZonedIso } from "@/lib/deals/schemas";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { listTalents } from "@/lib/talent/queries";
import { brandOption, talentOption } from "@/lib/ui/entity";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string; dia?: string; creator?: string; marca?: string; tipo?: string }> };

// Agenda da agência (5.6): eventos de sistema (campanhas confirmadas, prazos, entregas) e manuais (reuniões,
// gravações, datas comerciais), por mês, com filtros. Gestor+ cria; o colaborador só nos negócios dele.
// Bloco 9: calendário em grade (AgendaCalendar); a consulta cobre a grade inteira (dias dos meses vizinhos) e
// traz os eventos de vários dias que começaram antes; os filtros continuam valendo para a grade.
// 0086: editar compromisso manual (lista do dia) e "Novo compromisso" no dia selecionado, pelo EventEditorProvider.
// Quem pode: gestor+ em qualquer manual; colaborador só nos negócios abertos dele (e só cria se tiver algum).
export default async function AgencyAgendaPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const sp = await searchParams;
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const { year, month } = parseMonth(sp.mes, tz);
  const { from, to } = queryRange(year, month);
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const nowMonth = (() => {
    const now = parseMonth(undefined, tz);
    return monthKey(now.year, now.month);
  })();
  // 0089: chamadas da marca (gestor+) entram como evento do período; os filtros de creator/marca não se aplicam a elas
  const showCalls = isManager && !sp.creator && !sp.marca && (!sp.tipo || sp.tipo === "brand_call");
  const [tbc, locale, calls] = await Promise.all([
    getTranslations("brandCall.agency"),
    getLocale() as Promise<Locale>,
    showCalls ? listAgencyBrandCalls(ctx.agency.id) : Promise.resolve({ available: false, items: [] }),
  ]);
  const [t, tc, tsp, tp, list, talents, brands, deals, feed, origin, user] = await Promise.all([
    getTranslations("agency.agenda"),
    getTranslations("commercial"),
    getTranslations("sponsorship.agency"),
    getTranslations("pickers"),
    listEvents({ from, to, overlap: true, agencyId: ctx.agency.id, talentId: sp.creator, brandId: sp.marca, kind: sp.tipo }),
    listTalents(ctx.agency.id),
    listAgencyBrands(ctx.agency.id),
    listDeals(ctx.agency.id),
    myFeedState(),
    getOrigin(),
    getUser(),
  ]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<CalendarDays />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const extra = { creator: sp.creator, marca: sp.marca, tipo: sp.tipo };
  const today = zonedDayKey(new Date(), tz);
  const dealIds = await writableDealIds(deals.items, isManager, user?.id ?? null);
  const dealSet = new Set(dealIds);
  const formOptions = {
    // colaborador: só os negócios em que pode criar
    deals: deals.items.filter((d) => dealSet.has(d.id)).map((d) => ({ id: d.id, name: d.title, brand: d.brand.name, logoUrl: d.brand.logoUrl })),
    talents: talents.items.map((x) => ({ id: x.id, name: x.name, city: x.city, state: x.state, hasLogin: x.hasLogin, avatarUrl: x.hero?.avatarUrl ?? null })),
    brands: brands.map((b) => ({ id: b.brand.id, name: b.brand.name, logoUrl: b.brand.logoUrl })),
    canPublishCommercialDate: isManager,
    dealRequired: !isManager,
  };
  const filtered = Boolean(sp.creator || sp.marca || sp.tipo);
  const callEvents: CalendarEvent[] = calls.items
    .filter((c) => c.viewStatus === "open" || c.viewStatus === "expired" || c.viewStatus === "won")
    .flatMap((c) => {
      const startsAt = toZonedIso(c.startsOn, "00:00", tz);
      const endsAt = toZonedIso(plusDays(c.endsOn || c.startsOn, 1), "00:00", tz);
      if (!startsAt || !endsAt || Date.parse(startsAt) >= Date.parse(to) || Date.parse(endsAt) < Date.parse(from)) return [];
      return [
        {
          id: `brand_call:${c.id}`,
          kind: "brand_call" as const,
          title: tbc("calendarTitle", { title: c.title }),
          subtitle: c.respondBy && c.viewStatus === "open" ? tbc("calendarSubtitle", { brand: c.brandName, date: formatDateTime(c.respondBy, locale, tz) }) : c.brandName,
          description: "",
          startsAt,
          endsAt,
          allDay: true,
          location: c.location,
          brandId: null,
          dealId: null,
          talentId: null,
          deliverableId: null,
          sponsorshipId: null,
          brandCallId: c.id,
          source: "system" as const,
          visibleToBrand: false,
          visibleToTalent: false,
          updatedAt: c.publishedAt ?? c.createdAt,
        },
      ];
    });
  const events = [...list.items, ...callEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <EventEditorProvider options={formOptions} timeZone={tz} today={today} permissions={{ isManager, dealIds }} canCreate={isManager || dealIds.length > 0}>
      <div className="flex flex-col gap-5" data-testid="agency-agenda">
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={
            <span className="flex flex-wrap gap-2">
              {/* 0085: oportunidade de patrocínio criada a partir da agenda (gestor+), já no mês em vista */}
              {isManager ? (
                <Button asChild size="sm" variant="secondary" leadingIcon={<Handshake />}>
                  <Link href={`/agencia/oportunidades/nova${monthKey(year, month) > nowMonth ? `?data=${monthKey(year, month)}-01` : ""}`} data-testid="agenda-new-sponsorship">
                    {tsp("fromAgenda")}
                  </Link>
                </Button>
              ) : null}
              <EventNewButton />
            </span>
          }
        />
        <form method="get" action="/agencia/agenda" className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_1fr_auto]" data-testid="agenda-filters">
          <input type="hidden" name="mes" value={monthKey(year, month)} />
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t("filters.talent")}
            <EntitySelect name="creator" defaultValue={sp.creator ?? ""} emptyLabel={t("filters.all")} roleInOption={false} options={formOptions.talents.map((x) => talentOption(tp, x))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t("filters.brand")}
            <EntitySelect name="marca" defaultValue={sp.marca ?? ""} emptyLabel={t("filters.all")} roleInOption={false} options={formOptions.brands.map((b) => brandOption(tp, b))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t("filters.kind")}
            <Select name="tipo" defaultValue={sp.tipo ?? ""}>
              <option value="">{t("filters.all")}</option>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tc(`eventKinds.${k}`)}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" variant="secondary">
              {t("filters.apply")}
            </Button>
            {filtered ? (
              <a href={`/agencia/agenda?mes=${monthKey(year, month)}`} className="inline-flex min-h-9 items-center px-2 text-sm text-fg-muted underline-offset-2 hover:underline">
                {t("filters.clear")}
              </a>
            ) : null}
          </div>
        </form>
        <AgendaCalendar
          events={events}
          timeZone={tz}
          portal="agency"
          year={year}
          month={month}
          today={today}
          base="/agencia/agenda"
          extraParams={extra}
          requestedDay={sp.dia}
          emptyTitle={filtered ? t("emptyFiltered") : t("empty")}
          emptyHint={filtered ? undefined : t("emptyHint")}
        />
        <FeedCard portal="agency" origin={origin} state={feed} />
      </div>
    </EventEditorProvider>
  );
}
