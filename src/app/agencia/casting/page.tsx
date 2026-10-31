import type { Metadata } from "next";
import { Contact, Plus, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { TalentStatusBadges } from "@/components/agency/TalentStatusBadges";
import { Avatar, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { formatCount } from "@/lib/talent/media-kit";
import { listManagers, listSegments, listTalents } from "@/lib/talent/queries";
import { AVAILABILITIES, COMMERCIAL_STATUSES } from "@/lib/talent/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("casting") };
}

type Props = { searchParams: Promise<{ segmento?: string; disponibilidade?: string; situacao?: string; gestor?: string; q?: string; status?: string }> };

const pick = (value: string | undefined, allowed: readonly string[]) => (value && allowed.includes(value) ? value : undefined);

// Casting da agência (6.2): talentos com e sem página pública. Filtros por parâmetro com formulário
// GET e <a> (nunca next/link na mesma página). Gestor+ cadastra; o colaborador consulta.
export default async function CastingPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const sp = await searchParams;
  const archived = sp.status === "arquivados";
  const filters = {
    segment: sp.segmento,
    availability: pick(sp.disponibilidade, AVAILABILITIES),
    status: pick(sp.situacao, COMMERCIAL_STATUSES),
    manager: sp.gestor,
    q: sp.q?.slice(0, 60),
    archived,
  };
  const [t, locale, list, segments, managers] = await Promise.all([
    getTranslations("agency.casting"),
    getLocale(),
    listTalents(ctx.agency.id, filters),
    listSegments(ctx.agency.id),
    listManagers(ctx.agency.id),
  ]);
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const segmentName = new Map(segments.map((s) => [s.id, s.name]));
  const filtered = Boolean(filters.segment || filters.availability || filters.status || filters.manager || filters.q);

  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Contact />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canEdit ? (
            <Button asChild size="sm" leadingIcon={<Plus />}>
              <Link href="/agencia/casting/novo">{t("new")}</Link>
            </Button>
          ) : null
        }
      />
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        <FilterAnchor href="/agencia/casting" active={!archived} label={t("filterActive")} />
        <FilterAnchor href="/agencia/casting?status=arquivados" active={archived} label={t("filterArchived")} />
      </nav>
      <form method="get" action="/agencia/casting" className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]" data-testid="casting-filters">
        {archived ? <input type="hidden" name="status" value="arquivados" /> : null}
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.search")}
          <Input name="q" defaultValue={filters.q ?? ""} maxLength={60} placeholder={t("filters.searchPlaceholder")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.segment")}
          <Select name="segmento" defaultValue={filters.segment ?? ""}>
            <option value="">{t("filters.all")}</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.availability")}
          <Select name="disponibilidade" defaultValue={filters.availability ?? ""}>
            <option value="">{t("filters.all")}</option>
            {AVAILABILITIES.map((a) => (
              <option key={a} value={a}>
                {t(`availability.${a}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.status")}
          <Select name="situacao" defaultValue={filters.status ?? ""}>
            <option value="">{t("filters.all")}</option>
            {COMMERCIAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.manager")}
          <Select name="gestor" defaultValue={filters.manager ?? ""}>
            <option value="">{t("filters.all")}</option>
            <option value="none">{t("filters.noManager")}</option>
            {managers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary" leadingIcon={<Search />}>
            {t("filters.apply")}
          </Button>
          {filtered ? (
            <a href={archived ? "/agencia/casting?status=arquivados" : "/agencia/casting"} className="inline-flex min-h-9 items-center px-2 text-sm text-fg-muted underline-offset-2 hover:underline">
              {t("filters.clear")}
            </a>
          ) : null}
        </div>
      </form>

      {list.items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="casting-list">
          {list.items.map((talent) => (
            <li key={talent.id}>
              <Link
                href={`/agencia/casting/${talent.id}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="flex items-center gap-3">
                  <Avatar src={talent.hero?.avatarUrl ?? null} name={talent.name} size="md" alt="" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-fg">{talent.name}</span>
                    <span className="truncate type-caption text-fg-muted">
                      {[talent.city, talent.state].filter(Boolean).join(" · ") || t("noLocation")}
                      {" · "}
                      {talent.hero ? t("withPage") : t("withoutPage")}
                    </span>
                  </span>
                </span>
                <TalentStatusBadges status={talent.commercialStatus} availability={talent.availability} consent={talent.consent} catalogVisible={talent.catalogVisible} archived={talent.archived} />
                <span className="flex flex-wrap gap-x-3 gap-y-1 type-caption text-fg-muted">
                  <span>{talent.segmentIds.map((id) => segmentName.get(id)).filter(Boolean).join(", ") || t("noSegments")}</span>
                  <span>{talent.topFollowers !== null ? t("topFollowers", { count: formatCount(talent.topFollowers, locale) ?? "" }) : t("noMetrics")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Contact />}
            title={filtered ? t("emptyFiltered") : archived ? t("emptyArchived") : t("empty")}
            description={canEdit && !archived && !filtered ? t("emptyHint") : undefined}
            action={
              canEdit && !archived && !filtered ? (
                <Button asChild leadingIcon={<Plus />}>
                  <Link href="/agencia/casting/novo">{t("new")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
