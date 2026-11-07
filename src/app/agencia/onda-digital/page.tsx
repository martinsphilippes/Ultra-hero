import type { Metadata } from "next";
import { ExternalLink, Mail } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { OndaStatusControl } from "@/components/onda-digital/OndaStatusControl";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDate, formatPlainDate } from "@/i18n/format";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { isOndaStatus } from "@/lib/onda-digital/format";
import { listOndaInbox } from "@/lib/onda-digital/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ondaDigital.agency");
  return { title: t("title") };
}

// Pedidos da Onda Digital (0132): só a Groscove vê; gestor+ avança a etapa e a marca acompanha pelo portal.
export default async function AgencyOndaDigitalPage() {
  const ctx = await requireAgency("staff");
  const [t, locale, items] = await Promise.all([getTranslations("ondaDigital"), getLocale() as Promise<Locale>, listOndaInbox()]);
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin) && (ctx.agency.slug === "groscove" || ctx.platformAdmin);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("agency.title")} description={t("agency.description")} />
      {items === null ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState title={t("agency.onlyGroscove")} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState title={t("agency.empty")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="onda-inbox">
          {items.map((r) => (
            <li key={r.id} id={`pedido-${r.id}`} className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="onda-inbox-item">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandLogo name={r.brand} url={r.logo_url} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-fg">{r.brand}</span>
                    <span className="type-caption text-fg-muted">{formatDate(r.created_at, locale)}</span>
                  </div>
                </div>
                <Badge variant={r.status === "closed" ? "neutral" : r.status === "live" ? "success" : r.status === "received" ? "warning" : "info"} size="sm">
                  {isOndaStatus(r.status) ? t(`statuses.${r.status}`) : r.status}
                </Badge>
              </div>
              <div className="flex flex-col gap-1 text-sm text-fg">
                <p className="font-semibold">
                  {r.package ?? t("agency.noPackage")} · {t(`purposes.${r.purpose}`)}
                </p>
                <p className="text-fg-muted">
                  {r.when_kind === "now"
                    ? t("mine.whenNow")
                    : r.when_kind === "date" && r.when_date
                      ? t("mine.whenDate", { date: formatPlainDate(r.when_date, locale) })
                      : t("mine.whenTbd")}
                  {r.budget_cents !== null ? ` · ${t("agency.budget", { value: formatCurrency(r.budget_cents / 100, locale) })}` : ""}
                </p>
                <p className="whitespace-pre-line">{r.subject}</p>
                {r.profiles.length > 0 ? (
                  <p className="type-caption text-fg-muted">
                    {t("agency.pages")}: {r.profiles.map((p) => `@${p.split(":")[1]}${p.startsWith("x:") ? " (X)" : ""}`).join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-fg-muted">
                <span>{t("agency.by", { name: r.requested_by || "—" })}</span>
                {r.email ? (
                  <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-accent-text underline">
                    <Mail className="size-3.5" aria-hidden="true" />
                    {r.email}
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {r.deal_id ? (
                  <Link href={`/agencia/negocios/${r.deal_id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
                    {t("agency.openDeal")}
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="type-caption text-fg-muted">{t("agency.noDeal")}</p>
                )}
                {canEdit && isOndaStatus(r.status) ? <OndaStatusControl id={r.id} status={r.status} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
