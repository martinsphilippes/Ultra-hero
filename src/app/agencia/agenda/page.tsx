import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EventForm } from "@/components/calendar/EventForm";
import { EventList } from "@/components/calendar/EventList";
import { FeedCard } from "@/components/calendar/FeedCard";
import { MonthNav } from "@/components/calendar/MonthNav";
import { Button, EmptyState, PageHeader, Select } from "@/components/ui";
import { listAgencyBrands } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getOrigin } from "@/lib/auth/origin";
import { monthKey, parseMonth, shiftMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState } from "@/lib/calendar/queries";
import { EVENT_KINDS } from "@/lib/calendar/vocab";
import { listDeals } from "@/lib/deals/queries";
import { listTalents } from "@/lib/talent/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string; creator?: string; marca?: string; tipo?: string }> };

// Agenda da agência (5.6): eventos de sistema (campanhas confirmadas, prazos, entregas) e manuais (reuniões,
// gravações, datas comerciais), por mês, com filtros. Gestor+ cria; o colaborador só nos negócios dele.
export default async function AgencyAgendaPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const sp = await searchParams;
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const { year, month } = parseMonth(sp.mes, tz);
  const next = shiftMonth(year, month, 1);
  const from = new Date(Date.UTC(year, month - 1, 1) - 24 * 3600_000).toISOString();
  const to = new Date(Date.UTC(next.year, next.month - 1, 1) + 24 * 3600_000).toISOString();
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const [t, tc, list, talents, brands, deals, feed, origin] = await Promise.all([
    getTranslations("agency.agenda"),
    getTranslations("commercial"),
    listEvents({ from, to, agencyId: ctx.agency.id, talentId: sp.creator, brandId: sp.marca, kind: sp.tipo }),
    listTalents(ctx.agency.id),
    listAgencyBrands(ctx.agency.id),
    listDeals(ctx.agency.id),
    myFeedState(),
    getOrigin(),
  ]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<CalendarDays />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const extra = { creator: sp.creator, marca: sp.marca, tipo: sp.tipo };
  const filtered = Boolean(sp.creator || sp.marca || sp.tipo);
  // o mês no fuso da agência: a consulta pega um dia de folga de cada lado; a lista filtra pelo rótulo do dia
  const inMonth = list.items.filter((e) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(new Date(e.startsAt));
    return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}` === monthKey(year, month);
  });

  return (
    <div className="flex flex-col gap-5" data-testid="agency-agenda">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <EventForm
            deals={deals.items.map((d) => ({ id: d.id, name: `${d.title} · ${d.brand.name}` }))}
            talents={talents.items.map((x) => ({ id: x.id, name: x.name }))}
            brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name }))}
            canPublishCommercialDate={isManager}
            dealRequired={!isManager}
          />
        }
      />
      <MonthNav base="/agencia/agenda" year={year} month={month} extraParams={extra} />
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
      <EventList events={inMonth} timeZone={tz} portal="agency" canDelete emptyTitle={filtered ? t("emptyFiltered") : t("empty")} emptyHint={filtered ? undefined : t("emptyHint")} />
      <FeedCard portal="agency" origin={origin} state={feed} />
    </div>
  );
}
