import { Download, Mail, Megaphone, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PaginationNav } from "@/components/admin-ops/PaginationNav";
import { Badge, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { formatE164ForDisplay } from "@/lib/auth/phone";
import { requireRole } from "@/lib/auth/session";
import { parseLaunchLeadsPage, parseLeadKindFilter, type LaunchLeadKind } from "@/lib/launch-leads";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("launchLeads.admin");
  return { title: t("title") };
}

const PAGE_SIZE = 25;
type SearchParams = Promise<{ tipo?: string; page?: string }>;

// /admin/interessados (0117): a lista "Seja o primeiro a saber" do teaser de lançamento (/conheca). Totais por tipo,
// filtro, lista paginada e a planilha (CSV). Leitura pela admin_launch_leads (security definer, confere admin).
export default async function AdminLaunchLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin", "/admin/interessados");
  const { tipo, page: rawPage } = await searchParams;
  const kind = parseLeadKindFilter(tipo);
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const supabase = await createClient();
  const [t, locale, res] = await Promise.all([
    getTranslations("launchLeads.admin"),
    getLocale(),
    supabase.rpc("admin_launch_leads", { p_kind: kind, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE }),
  ]);
  const n = (v: number) => formatNumber(v, locale);
  const csvHref = `/admin/interessados/planilha${kind ? `?tipo=${kind}` : ""}`;

  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      backHref="/admin"
      backLabel={t("back")}
      actions={
        <a
          href={csvHref}
          download
          data-testid="launch-leads-csv"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Download className="size-4" aria-hidden="true" />
          {t("csv")}
        </a>
      }
    />
  );

  if (res.error) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-2xl border border-border bg-surface">
          <ErrorState title={t("unavailable")} description={t("unavailableHint")} />
        </div>
      </div>
    );
  }

  const data = parseLaunchLeadsPage(res.data);
  const filters: Array<{ key: LaunchLeadKind | null; label: string; count: number; icon: typeof Users }> = [
    { key: null, label: t("filters.all"), count: data.totals.all, icon: Users },
    { key: "publico", label: t("kinds.publico"), count: data.totals.publico, icon: Megaphone },
    { key: "influenciador", label: t("kinds.influenciador"), count: data.totals.influenciador, icon: Sparkles },
  ];

  return (
    <div className="flex flex-col gap-6">
      {header}

      {/* totais por tipo = filtros (cartões clicáveis) */}
      <nav aria-label={t("filters.label")}>
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {filters.map((f) => {
            const active = f.key === kind;
            const Icon = f.icon;
            return (
              <li key={f.key ?? "all"} className="min-w-0">
                <Link
                  href={f.key ? `/admin/interessados?tipo=${f.key}` : "/admin/interessados"}
                  aria-current={active ? "page" : undefined}
                  data-testid={`launch-leads-total-${f.key ?? "all"}`}
                  className={cn(
                    "flex min-h-24 flex-col justify-between gap-2 rounded-xl border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-4",
                    active ? "border-accent" : "border-border",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{f.label}</span>
                  </span>
                  <span className="type-numeric text-2xl font-bold text-fg">{n(f.count)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Mail />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="launch-leads">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.kind === "influenciador" ? "accent" : "neutral"} size="sm">
                  {t(`kinds.${r.kind}`)}
                </Badge>
                <span className="type-caption text-fg-muted">{r.createdAt ? formatDateTime(r.createdAt, locale) : "—"}</span>
              </div>
              <p className="text-sm font-semibold break-words text-fg">{r.name}</p>
              <p className="type-body-sm break-all text-fg-muted">
                <a href={`mailto:${r.email}`} className="hover:underline">
                  {r.email}
                </a>
                {" · "}
                <a href={`tel:${r.phone}`} className="hover:underline">
                  {formatE164ForDisplay(r.phone)}
                </a>
                {r.instagram ? (
                  <>
                    {" · "}
                    <a href={`https://instagram.com/${r.instagram}`} target="_blank" rel="noreferrer noopener" className="hover:underline">
                      @{r.instagram}
                    </a>
                  </>
                ) : null}
              </p>
              {r.utmSource || r.utmCampaign ? (
                <p className="type-caption text-fg-muted">{t("origin", { origin: [r.utmSource, r.utmMedium, r.utmCampaign].filter(Boolean).join(" · ") })}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <PaginationNav basePath="/admin/interessados" params={{ tipo: kind ?? undefined }} page={page} hasNext={page * PAGE_SIZE < data.filtered} total={data.filtered} />
    </div>
  );
}
