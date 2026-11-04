import type { Metadata } from "next";
import { CalendarDays, ChevronRight, FileUp, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { AgendaTabs } from "@/components/culture/AgendaTabs";
import { AgendaFilterBar } from "@/components/platform-calendar/AgendaFilterBar";
import { PlatformBadges, useCollectionLabel } from "@/components/platform-calendar/PlatformBadges";
import { eventWhen } from "@/components/platform-calendar/PlatformEventView";
import { Button, EmptyState, PageHeader, Select } from "@/components/ui";
import { defaultTimeZone, type Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { monthKey, parseMonth } from "@/lib/calendar/ics";
import { ADMIN_PAGE_SIZE, adminListPlatformEvents, listCollections, listImports, listPlatformEvents, platformToCalendar } from "@/lib/platform-calendar/queries";
import { agendaFilterParams, filterAgenda, isPlatformStatus, isTerritory, parseAgendaFilters, PLATFORM_STATUSES, TERRITORIES } from "@/lib/platform-calendar/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar.admin");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ v?: string; mes?: string; dia?: string; ano?: string; territorio?: string; estado?: string; colecao?: string; q?: string; p?: string }> };

function CollectionName({ slug }: { slug: string }) {
  const label = useCollectionLabel();
  return <>{label(slug)}</>;
}

// Calendário Groscove no admin (0098): o calendário central da plataforma que todos os portais veem. Duas vistas:
// lista (filtros por ano, território, estado, coleção e busca; paginada) e mês (grade com tudo, inclusive rascunhos).
// Novo evento, importação (JSON/CSV com pré-visualização) e as últimas importações.
export default async function AdminAgendaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const view = sp.v === "mes" ? "mes" : "lista";
  const [t, tg, locale] = await Promise.all([getTranslations("groscoveCalendar.admin"), getTranslations("groscoveCalendar"), getLocale() as Promise<Locale>]);
  const tz = defaultTimeZone;
  const tabs = (
    <nav className="flex gap-2" aria-label={t("views")}>
      {(["lista", "mes"] as const).map((v) => (
        <Button key={v} asChild size="sm" variant={view === v ? "primary" : "secondary"}>
          <Link href={`/admin/agenda?v=${v}`} aria-current={view === v ? "page" : undefined}>
            {t(`view.${v}`)}
          </Link>
        </Button>
      ))}
    </nav>
  );
  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      actions={
        <span className="flex flex-wrap gap-2">
          <Button asChild size="sm" leadingIcon={<Plus />}>
            <Link href="/admin/agenda/novo" data-testid="platform-new">
              {t("new")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary" leadingIcon={<FileUp />}>
            <Link href="/admin/agenda/importar" data-testid="platform-import">
              {t("import")}
            </Link>
          </Button>
        </span>
      }
    />
  );

  if (view === "mes") {
    const { year, month } = parseMonth(sp.mes, tz);
    const { from, to } = queryRange(year, month);
    const filters = { ...parseAgendaFilters({ territorio: sp.territorio, colecao: sp.colecao }), mode: "groscove" as const };
    const list = await listPlatformEvents({ from, to, published: false });
    const events = filterAgenda(list.items.map(platformToCalendar), filters);
    const collections = [...new Set(list.items.map((e) => e.collection).filter((x): x is string => Boolean(x)))].sort();
    return (
      <div className="flex flex-col gap-5" data-testid="admin-agenda">
        {header}
        <AgendaTabs base="/admin/agenda" active="agenda" />
        {tabs}
        <AgendaFilterBar base="/admin/agenda" params={{ v: "mes", mes: monthKey(year, month) }} filters={filters} collections={collections} showMode={false} />
        <AgendaCalendar
          events={events}
          timeZone={tz}
          portal="admin"
          year={year}
          month={month}
          today={zonedDayKey(new Date(), tz)}
          base="/admin/agenda"
          extraParams={{ v: "mes", ...agendaFilterParams(filters), cal: undefined }}
          requestedDay={sp.dia}
          emptyTitle={t("emptyMonth")}
        />
      </div>
    );
  }

  const year = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : null;
  const territory = isTerritory(sp.territorio) ? sp.territorio : null;
  const status = isPlatformStatus(sp.estado) ? sp.estado : null;
  const collection = sp.colecao && /^[a-z0-9-]{1,60}$/.test(sp.colecao) ? sp.colecao : null;
  const page = Math.max(1, Number(sp.p) || 1);
  const [list, collections, imports] = await Promise.all([
    adminListPlatformEvents({ year, territory, status, collection, q: sp.q ?? null, page }),
    listCollections(),
    listImports(5),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / ADMIN_PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ano: sp.ano, territorio: sp.territorio, estado: sp.estado, colecao: sp.colecao, q: sp.q })) if (v) u.set(k, v);
    u.set("p", String(p));
    return `/admin/agenda?${u.toString()}`;
  };
  const thisYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-5" data-testid="admin-agenda">
      {header}
      <AgendaTabs base="/admin/agenda" active="agenda" />
      {tabs}
      <form method="get" action="/admin/agenda" className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="admin-agenda-filters">
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.year")}
          <Select name="ano" defaultValue={sp.ano ?? ""} selectSize="sm">
            <option value="">{t("filters.all")}</option>
            {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.territory")}
          <Select name="territorio" defaultValue={territory ?? ""} selectSize="sm">
            <option value="">{t("filters.all")}</option>
            {TERRITORIES.map((k) => (
              <option key={k} value={k}>
                {tg(`territories.${k}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.status")}
          <Select name="estado" defaultValue={status ?? ""} selectSize="sm">
            <option value="">{t("filters.all")}</option>
            {PLATFORM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tg(`status.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.collection")}
          <Select name="colecao" defaultValue={collection ?? ""} selectSize="sm">
            <option value="">{t("filters.all")}</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.search")}
          <input name="q" defaultValue={sp.q ?? ""} maxLength={80} className="min-h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg" />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary">
            {t("filters.apply")}
          </Button>
          <Link href="/admin/agenda" className="inline-flex min-h-9 items-center px-2 text-sm text-fg-muted underline-offset-2 hover:underline">
            {t("filters.clear")}
          </Link>
        </div>
      </form>

      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<CalendarDays />} title={t("unavailable")} />
        </div>
      ) : list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<CalendarDays />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <>
          <p className="type-caption text-fg-muted">{t("total", { count: list.total })}</p>
          <ul className="flex flex-col gap-2" data-testid="admin-agenda-list">
            {list.items.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/admin/agenda/${e.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <PlatformBadges info={platformToCalendar(e).platform!} showStatus />
                    <span className={`font-semibold text-fg ${e.status === "cancelled" ? "line-through opacity-70" : ""}`}>{e.title}</span>
                    <span className="type-caption text-fg-muted">
                      {eventWhen(e, locale)}
                      {e.collection ? (
                        <>
                          {" · "}
                          <CollectionName slug={e.collection} />
                        </>
                      ) : null}
                      {e.category ? ` · ${e.category}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav className="flex items-center justify-between gap-2" aria-label={t("pager")}>
              {page > 1 ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={qs(page - 1)}>{t("prev")}</Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="type-caption text-fg-muted">{t("page", { page, pages })}</span>
              {page < pages ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={qs(page + 1)}>{t("next")}</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="admin-imports">
        <h2 className="text-sm font-semibold text-fg">{t("importsTitle")}</h2>
        {imports.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("importsEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {imports.map((i) => (
              <li key={i.id} className="flex flex-col gap-0.5 py-2">
                <span className="text-sm font-medium text-fg">{i.sourceName}</span>
                <span className="type-caption text-fg-muted">
                  {t("importLine", {
                    date: formatDateTime(i.createdAt, locale, tz),
                    file: i.fileName || i.format,
                    created: Number(i.counts.created ?? 0),
                    updated: Number(i.counts.updated ?? 0),
                    skipped: Number(i.counts.skipped ?? 0),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
