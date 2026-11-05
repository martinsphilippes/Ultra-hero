import type { Metadata } from "next";
import { Contact, Plus, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { CastingCard } from "@/components/agency/CastingCard";
import { Button, EmptyState, EntitySelect, Input, PageHeader, Select } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { resolveTalentAccess } from "@/lib/talent/access";
import { formatCount } from "@/lib/talent/media-kit";
import { listManagers, listSegments, listTalentAccess, listTalents } from "@/lib/talent/queries";
import { AVAILABILITIES, COMMERCIAL_STATUSES } from "@/lib/talent/vocab";
import { memberOption } from "@/lib/ui/entity";

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
  const [t, tp, locale, list, segments, managers, access] = await Promise.all([
    getTranslations("agency.casting"),
    getTranslations("pickers"),
    getLocale(),
    listTalents(ctx.agency.id, filters),
    listSegments(ctx.agency.id),
    listManagers(ctx.agency.id),
    // selo do acesso do creator (0087); arquivado não tem acesso a mostrar
    archived ? Promise.resolve(new Map()) : listTalentAccess(ctx.agency.id),
  ]);
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const segmentName = new Map(segments.map((s) => [s.id, s.name]));
  const managerName = new Map(managers.map((m) => [m.userId, m.name]));
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
          <EntitySelect name="gestor" defaultValue={filters.manager ?? ""} emptyLabel={t("filters.all")} extraOptions={[{ value: "none", label: t("filters.noManager") }]} options={managers.map((m) => memberOption(tp, m))} />
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
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="casting-list">
          {list.items.map((talent) => {
            const accessState = talent.archived ? null : resolveTalentAccess(access.get(talent.id), talent);
            const manager = talent.managerId ? managerName.get(talent.managerId) : null;
            const followers = talent.topFollowers !== null ? t("topFollowers", { count: formatCount(talent.topFollowers, locale) ?? "" }) : null;
            return (
              <li key={talent.id}>
                <CastingCard
                  href={`/agencia/casting/${talent.id}`}
                  name={talent.name}
                  photoUrl={talent.hero?.avatarUrl ?? talent.photoUrl}
                  category={talent.category}
                  topics={talent.topics.length > 0 ? talent.topics : talent.segmentIds.map((id) => segmentName.get(id)).filter((n): n is string => Boolean(n))}
                  instagram={talent.instagram}
                  testId="casting-card"
                  meta={
                    <>
                      <span className="block">
                        {[
                          talent.archived ? t("archivedTag") : null,
                          t(`status.${talent.commercialStatus}`),
                          t(`availability.${talent.availability}`),
                          accessState ? t(`access.${accessState}`) : null,
                          talent.catalogVisible ? t("inCatalog") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="block truncate">{[manager ? t("card.manager", { name: manager }) : t("card.noManager"), followers].filter(Boolean).join(" · ")}</span>
                    </>
                  }
                />
              </li>
            );
          })}
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
