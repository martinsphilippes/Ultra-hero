import type { Metadata } from "next";
import { CalendarDays, Handshake } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { EventEditorProvider, EventNewButton } from "@/components/calendar/EventEditor";
import { FeedCard } from "@/components/calendar/FeedCard";
import { Button, EmptyState, PageHeader, Select } from "@/components/ui";
import { listAgencyBrands } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { getUser } from "@/lib/auth/session";
import { queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { monthKey, parseMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState, writableDealIds } from "@/lib/calendar/queries";
import { EVENT_KINDS } from "@/lib/calendar/vocab";
import { listDeals } from "@/lib/deals/queries";
import { listTalents } from "@/lib/talent/queries";

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
  const [t, tc, tsp, list, talents, brands, deals, feed, origin, user] = await Promise.all([
    getTranslations("agency.agenda"),
    getTranslations("commercial"),
    getTranslations("sponsorship.agency"),
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
    deals: deals.items.filter((d) => dealSet.has(d.id)).map((d) => ({ id: d.id, name: `${d.title} · ${d.brand.name}` })),
    talents: talents.items.map((x) => ({ id: x.id, name: x.name })),
    brands: brands.map((b) => ({ id: b.brand.id, name: b.brand.name })),
    canPublishCommercialDate: isManager,
    dealRequired: !isManager,
  };
  const filtered = Boolean(sp.creator || sp.marca || sp.tipo);

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
            <Select name="creator" defaultValue={sp.creator ?? ""}>
              <option value="">{t("filters.all")}</option>
              {talents.items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t("filters.brand")}
            <Select name="marca" defaultValue={sp.marca ?? ""}>
              <option value="">{t("filters.all")}</option>
              {brands.map((b) => (
                <option key={b.brand.id} value={b.brand.id}>
                  {b.brand.name}
                </option>
              ))}
            </Select>
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
          events={list.items}
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
