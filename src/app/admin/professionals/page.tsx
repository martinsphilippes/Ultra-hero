import type { Metadata } from "next";
import { ChevronRight, Plus, Stethoscope } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { VerifiedBadge } from "@/components/professionals/ProfessionalBits";
import { Avatar, Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { listAdminProfessionals } from "@/lib/professionals/admin";
import { durationParts, PROFESSIONAL_STATUSES, type ProfessionalStatus } from "@/lib/professionals/rules";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("professionals.admin");
  return { title: t("title") };
}

const STATUS_BADGE = { pending: "warning", approved: "success", suspended: "danger" } as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Profissionais no admin (0058), no celular primeiro: lista em cards com situação, selo, pedidos
// aguardando e tempo de resposta (mediana); filtro por situação.
export default async function AdminProfessionalsPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.situacao) ? params.situacao[0] : params.situacao;
  const status: ProfessionalStatus | null = (PROFESSIONAL_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as ProfessionalStatus) : null;
  const [t, tp, tm, list] = await Promise.all([getTranslations("professionals.admin"), getTranslations("professionals.portal"), getTranslations("professionals"), listAdminProfessionals(status)]);
  const filters: (ProfessionalStatus | null)[] = [null, ...PROFESSIONAL_STATUSES];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild leadingIcon={<Plus />}>
            <Link href="/admin/professionals/new">{t("new")}</Link>
          </Button>
        }
      >
        <nav aria-label={t("columns.status")}>
          <ul className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <li key={f ?? "all"}>
                <Link
                  href={f ? `/admin/professionals?situacao=${f}` : "/admin/professionals"}
                  aria-current={f === status ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    f === status ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg hover:bg-surface-hover",
                  )}
                >
                  {t(`filters.${f ?? "all"}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Stethoscope />} title={tp("unavailable")} />
        </div>
      ) : list.rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Stethoscope />} title={t("empty")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="admin-pro-list">
          {list.rows.map((p) => {
            const median = p.medianMinutes === null ? null : durationParts(p.medianMinutes);
            return (
              <li key={p.id}>
                <Link
                  href={`/admin/professionals/${p.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <Avatar src={p.photoUrl} name={p.name} size="md" alt="" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{p.name}</span>
                      <Badge variant={STATUS_BADGE[p.status]} size="sm">
                        {tp(`status.${p.status}`)}
                      </Badge>
                      {p.registryVerified ? <VerifiedBadge /> : null}
                    </span>
                    <span className="type-caption text-fg-muted">
                      {tm(`specialty.${p.specialty}`)} · {p.userId ? t("account.linked") : t("account.none")}
                    </span>
                    <span className="type-caption text-fg-muted">
                      {t("columns.orders")}: {p.orders} · {tp("kpi.pending")}: {p.pending}
                      {median ? ` · ${t("columns.response")}: ${tp(`duration.${median.unit}`, { value: median.value })}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
