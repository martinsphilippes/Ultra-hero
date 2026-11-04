import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { RecurrenceCard } from "@/components/roadmap/RecurrenceCard";
import { RoadmapProgress } from "@/components/roadmap/RoadmapProgress";
import { DealClientForm, RoadmapStart } from "@/components/roadmap/RoadmapStart";
import { RoadmapSteps } from "@/components/roadmap/RoadmapSteps";
import { EmptyState } from "@/components/ui";
import { listTeam } from "@/lib/agency/queries";
import { getDealRecurrence } from "@/lib/roadmap/phase3-queries";
import { getDealRoadmap, listServices, listTeamSectors } from "@/lib/roadmap/queries";
import { addDays } from "@/lib/roadmap/recurrence";
import { clientKindOf } from "@/lib/roadmap/vocab";
import { listTalents } from "@/lib/talent/queries";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealRoadmap") };
}

type Props = { params: Promise<{ id: string }> };

// Roteiro do negócio (0107): serviço do catálogo → etapas por setor com prazo em dias úteis (cadeia), "Dia X de N úteis
// · No prazo/Atrasado", previsão de entrega, marcar feita e reatribuir. Também o herói-cliente (vê o projeto no Portal).
export default async function DealRoadmapPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, canEdit, isManager } = await loadDeal(id);
  const [t, roadmap, services, team, sectors, talents, recurrence] = await Promise.all([
    getTranslations("roadmap.deal"),
    getDealRoadmap(deal.id),
    listServices(ctx.agency.id, { activeOnly: true }),
    listTeam(ctx.agency.id),
    listTeamSectors(ctx.agency.id),
    canEdit ? listTalents(ctx.agency.id) : Promise.resolve({ available: true, items: [] }),
    // 0111: contrato recorrente (assessoria de imprensa/artística): ciclos e etapas recorrentes
    getDealRecurrence(deal.id),
  ]);
  if (!roadmap.available || !services.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ListChecks />} title={t("unavailable")} />
      </div>
    );
  }
  const data = roadmap.data;
  const progress = data?.progress ?? null;
  const hasBrand = deal.brand.id !== "";
  const client = clientKindOf(hasBrand, Boolean(deal.clientTalent));
  const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const serviceOptions = services.items.map((x) => ({ id: x.id, name: x.name, clientKind: x.clientKind, slaDays: x.slaDays, stepCount: x.stepCount }));
  const rec = recurrence.data && (recurrence.data.eligible || recurrence.data.config) ? recurrence.data : null;
  // início sugerido do 1º ciclo: o dia seguinte à previsão do roteiro base (ou hoje)
  const recStart = rec ? (progress?.forecast && progress.forecast >= rec.today ? addDays(progress.forecast, 1) : rec.today) : "";
  const members = team.map((m) => ({ userId: m.userId, name: m.name, role: m.role, jobTitle: m.jobTitle, sectors: sectors.get(m.userId) ?? [] }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]" data-testid="deal-roadmap">
      <div className="flex flex-col gap-5">
        {data && progress ? (
          <section className={card} aria-labelledby="roadmap-title">
            <div className="flex flex-col gap-1">
              <h2 id="roadmap-title" className="text-base font-semibold text-fg">
                {data.service?.name ?? progress.service ?? t("title")}
              </h2>
              {!data.canEdit ? <p className="type-body-sm text-fg-muted">{t("closed")}</p> : null}
            </div>
            <RoadmapProgress progress={progress} />
            <RoadmapSteps dealId={deal.id} tasks={data.tasks} today={progress.today} members={members} canAssign={canEdit} />
          </section>
        ) : (
          <section className={card} aria-labelledby="roadmap-empty">
            <div className="flex flex-col gap-1">
              <h2 id="roadmap-empty" className="text-base font-semibold text-fg">
                {t("noRoadmap")}
              </h2>
              <p className="type-body-sm text-fg-muted">{t("noRoadmapHint")}</p>
            </div>
            {canEdit && serviceOptions.length > 0 ? <RoadmapStart dealId={deal.id} services={serviceOptions} client={client} /> : null}
            {serviceOptions.length === 0 ? (
              <p className="type-body-sm text-fg-muted">
                {t("noServices")}{" "}
                {isManager ? (
                  <Link href="/agencia/configuracoes/servicos" className="font-medium text-accent-text underline-offset-2 hover:underline">
                    {t("catalogLink")}
                  </Link>
                ) : null}
              </p>
            ) : null}
          </section>
        )}
      </div>
      <div className="flex flex-col gap-5">
        {rec ? <RecurrenceCard dealId={deal.id} data={rec} defaultStart={recStart} /> : null}
        <section className={card} aria-labelledby="roadmap-client">
          <h2 id="roadmap-client" className="text-base font-semibold text-fg">
            {t("clientTitle")}
          </h2>
          <p className="text-sm text-fg">{deal.clientLabel || "—"}</p>
          {canEdit && talents.items.length > 0 ? (
            <DealClientForm
              dealId={deal.id}
              hasBrand={hasBrand}
              current={deal.clientTalent?.id ?? null}
              talents={talents.items.map((x) => ({ id: x.id, name: x.name, city: x.city, state: x.state, avatarUrl: x.hero?.avatarUrl ?? null }))}
            />
          ) : null}
        </section>
        {data && progress && data.canReplace && canEdit && serviceOptions.length > 0 ? (
          <section className={card} aria-labelledby="roadmap-replace">
            <div className="flex flex-col gap-1">
              <h2 id="roadmap-replace" className="text-base font-semibold text-fg">
                {t("replaceTitle")}
              </h2>
              <p className="type-body-sm text-fg-muted">{t("replaceHint")}</p>
            </div>
            <RoadmapStart dealId={deal.id} services={serviceOptions} client={client} replacing currentServiceId={data.service?.id ?? null} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
