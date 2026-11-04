import type { Metadata } from "next";
import { ChevronRight, ListChecks, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { RestoreServicesButton } from "@/components/roadmap/RestoreServicesButton";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { listServices } from "@/lib/roadmap/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("services") };
}

// Catálogo de serviços e roteiros (0107): os 8 produtos do modelo Groscove já vêm semeados; o Adm edita, cria e
// desativa; o gestor só consulta.
export default async function ServicesPage() {
  const ctx = await requireAgency("manager");
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const [t, tk, list] = await Promise.all([getTranslations("roadmap.catalog"), getTranslations("roadmap.clientKinds"), listServices(ctx.agency.id)]);
  const locked = ctx.agency.isDemo;
  return (
    <div className="flex flex-col gap-5" data-testid="services-page">
      <PageHeader
        title={t("title")}
        description={t("description")}
        backHref="/agencia/configuracoes"
        backLabel={t("backToSettings")}
        actions={
          isAdmin && !locked ? (
            <Button asChild leadingIcon={<Plus />}>
              <Link href="/agencia/configuracoes/servicos/novo" data-testid="service-new">
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {!isAdmin ? <p className="type-body-sm text-fg-muted">{t("adminOnly")}</p> : null}
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<ListChecks />} title={t("unavailable")} />
        </div>
      ) : list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<ListChecks />} title={t("empty")} />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="services-list">
          {list.items.map((s) => (
            <li key={s.id}>
              <Link href={`/agencia/configuracoes/servicos/${s.id}`} className="flex min-h-16 items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-hover">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{s.name}</span>
                    {!s.active ? (
                      <Badge variant="neutral" size="sm">
                        {t("inactive")}
                      </Badge>
                    ) : null}
                    {s.fromModel ? (
                      <Badge variant="accent" size="sm">
                        {t("fromModel")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="type-caption text-fg-muted">
                    {t("sla", { days: s.slaDays })} · {t("steps", { count: s.stepCount })} · {tk(s.clientKind)}
                    {s.milestoneDays && s.milestoneLabel ? ` · ${t("milestone", { label: s.milestoneLabel, days: s.milestoneDays })}` : ""}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && !locked && list.available ? (
        <div className="flex flex-col gap-2">
          <RestoreServicesButton />
          <p className="type-caption text-fg-muted">{t("restoreHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
