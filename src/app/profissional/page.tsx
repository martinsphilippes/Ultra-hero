import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { OrderCardLink } from "@/components/professionals/portal/OrderCardLink";
import { VerifiedBadge } from "@/components/professionals/ProfessionalBits";
import { Badge, PageHeader } from "@/components/ui";
import { getMyProfessional, professionalOrders } from "@/lib/professionals/queries";
import { durationParts, responseStats } from "@/lib/professionals/rules";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("professionals.meta");
  return { title: t("portal") };
}

const STATUS_BADGE = { pending: "warning", approved: "success", suspended: "danger" } as const;

// Painel do profissional: situação do perfil, pedidos por situação, tempo de resposta e os recentes.
export default async function ProfessionalDashboard() {
  const { professional: pro } = await getMyProfessional();
  if (!pro) return null;
  const [t, orders] = await Promise.all([getTranslations("professionals.portal"), professionalOrders(pro.id, null, 200)]);
  const stats = responseStats(orders.map((o) => ({ createdAt: o.createdAt, firstResponseAt: o.firstResponseAt })));
  const count = (s: string[]) => orders.filter((o) => s.includes(o.status)).length;
  const median = stats.medianMinutes === null ? t("kpi.none") : (() => {
    const d = durationParts(stats.medianMinutes);
    return t(`duration.${d.unit}`, { value: d.value });
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pro.name}
        description={t("description")}
        eyebrow={t("title")}
        actions={
          pro.status === "approved" ? (
            <Link href={`/profissionais/${pro.slug}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
              {t("viewPublic")}
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          ) : null
        }
      />
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="pro-status">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGE[pro.status]}>{t(`status.${pro.status}`)}</Badge>
          {pro.registryVerified ? <VerifiedBadge /> : null}
        </div>
        <p className="type-body-sm text-fg-muted">{t(`statusHint.${pro.status}`)}</p>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("kpi.pending")} value={count(["pending"])} />
        <KpiCard label={t("kpi.open")} value={count(["accepted", "scheduled"])} />
        <KpiCard label={t("kpi.completed")} value={count(["completed"])} />
        <KpiCard label={t("kpi.median")} value={median} />
      </div>
      <section aria-labelledby="pro-latest" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pro-latest" className="type-h3 text-fg">
            {t("latest")}
          </h2>
          <Link href="/profissional/pedidos" className="text-sm font-semibold text-accent-text hover:underline">
            {t("seeAll")}
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("noOrders")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <OrderCardLink order={o} href={`/profissional/pedidos/${o.id}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
