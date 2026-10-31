import type { Metadata } from "next";
import { KanbanSquare, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { StageBadge } from "@/components/deals/StatusBadges";
import { Button, EmptyState, PageHeader, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate, formatRelativeTime } from "@/i18n/format";
import { listAgencyBrands, listTeam } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getUser } from "@/lib/auth/session";
import { listDeals } from "@/lib/deals/queries";
import { DEAL_STAGES, type DealStage } from "@/lib/deals/stages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("pipeline") };
}

type Props = { searchParams: Promise<{ responsavel?: string; marca?: string; status?: string }> };

// Pipeline comercial (6.2): negócios por etapa, do briefing ao encerramento. Gestor+ vê tudo; o
// colaborador só os negócios em que é responsável ou está na equipe (RLS). Filtros por parâmetro.
export default async function PipelinePage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const sp = await searchParams;
  const closed = sp.status === "encerrados";
  const user = await getUser();
  const ownerFilter = sp.responsavel === "me" ? user?.id : sp.responsavel;
  const [t, tc, locale, list, brands, team] = await Promise.all([
    getTranslations("agency.pipeline"),
    getTranslations("commercial"),
    getLocale() as Promise<Locale>,
    listDeals(ctx.agency.id, { owner: ownerFilter, brand: sp.marca, closed }),
    listAgencyBrands(ctx.agency.id),
    listTeam(ctx.agency.id),
  ]);
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const names = new Map(team.map((m) => [m.userId, m.name]));
  const filtered = Boolean(sp.responsavel || sp.marca);

  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<KanbanSquare />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }

  const stages: DealStage[] = closed ? ["closed"] : DEAL_STAGES.filter((s) => s !== "closed");
  const byStage = new Map<DealStage, typeof list.items>(stages.map((s) => [s, []]));
  for (const deal of list.items) byStage.get(deal.stage)?.push(deal);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          isManager ? (
            <Button asChild size="sm" leadingIcon={<Plus />}>
              <Link href="/agencia/pipeline/novo">{t("new")}</Link>
            </Button>
          ) : null
        }
      />
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        <FilterAnchor href="/agencia/pipeline" active={!closed} label={t("filterOpen")} />
        <FilterAnchor href="/agencia/pipeline?status=encerrados" active={closed} label={t("filterClosed")} />
      </nav>
      <form method="get" action="/agencia/pipeline" className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]" data-testid="pipeline-filters">
        {closed ? <input type="hidden" name="status" value="encerrados" /> : null}
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.owner")}
          <Select name="responsavel" defaultValue={sp.responsavel ?? ""}>
            <option value="">{t("filters.all")}</option>
            <option value="me">{t("filters.mine")}</option>
            <option value="none">{t("filters.noOwner")}</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
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
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary">
            {t("filters.apply")}
          </Button>
          {filtered ? (
            <a href={closed ? "/agencia/pipeline?status=encerrados" : "/agencia/pipeline"} className="inline-flex min-h-9 items-center px-2 text-sm text-fg-muted underline-offset-2 hover:underline">
              {t("filters.clear")}
            </a>
          ) : null}
        </div>
      </form>

      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<KanbanSquare />} title={filtered ? t("emptyFiltered") : closed ? t("emptyClosed") : t("empty")} description={!filtered && !closed ? t("emptyHint") : undefined} />
        </div>
      ) : (
        // celular: seções empilhadas (só etapas com negócio); md+: colunas com rolagem lateral
        <div className="flex flex-col gap-4 md:-mx-1 md:flex-row md:items-start md:gap-3 md:overflow-x-auto md:px-1 md:pb-3" data-testid="pipeline-board">
          {stages.map((stage) => {
            const deals = byStage.get(stage) ?? [];
            return (
              <section key={stage} className={`flex flex-col gap-2 md:w-72 md:shrink-0 ${deals.length === 0 ? "hidden md:flex" : ""}`} aria-labelledby={`stage-${stage}`}>
                <h2 id={`stage-${stage}`} className="flex items-center justify-between gap-2 px-1 text-sm font-semibold text-fg">
                  <span>{tc(`stages.${stage}`)}</span>
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 type-caption text-fg-muted">{deals.length}</span>
                </h2>
                <ul className="flex flex-col gap-2 md:min-h-16 md:rounded-2xl md:border md:border-dashed md:border-border md:p-2">
                  {deals.map((deal) => (
                    <li key={deal.id}>
                      <Link
                        href={`/agencia/negocios/${deal.id}`}
                        className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        data-testid="deal-card"
                      >
                        <span className="text-sm font-semibold text-fg">{deal.title}</span>
                        <span className="type-caption text-fg-muted">{deal.brand.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5 type-caption text-fg-muted">
                          {closed ? <StageBadge stage={deal.stage} outcome={deal.outcome} /> : null}
                          <span>{deal.ownerId ? (names.get(deal.ownerId) ?? t("ownerUnknown")) : t("noOwner")}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t("talents", { count: deal.talentCount })}</span>
                        </span>
                        <span className="type-caption text-fg-muted">
                          {deal.expectedStart ? t("startsOn", { date: formatPlainDate(deal.expectedStart, locale) }) : t("noDate")} · {t("inStage", { when: formatRelativeTime(deal.stageChangedAt, locale) })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
