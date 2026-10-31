import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ReportResolveButtons } from "@/components/moderation/ReportResolveButtons";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.reports")}` };
}

type SearchParams = Promise<{ status?: string }>;

// Denúncias (0071, diretriz 1.2 da App Store): pendentes primeiro; a meta é responder em até 24 horas.
export default async function AdminReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = sp.status === "dismissed" || sp.status === "actioned" ? sp.status : "new";
  const [t, tr, locale, supabase] = await Promise.all([getTranslations("moderation.admin"), getTranslations("moderation.reasons"), getLocale(), createClient()]);
  const { data, error } = await supabase
    .from("content_reports")
    .select("id, reason, details, status, created_at, content:content(id, slug, title, status), creator:creator_profiles(id, slug, name, status)")
    .eq("status", status)
    .order("created_at", { ascending: status !== "new" })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <nav className="flex gap-3 text-sm" aria-label={t("filter")}>
        {(["new", "actioned", "dismissed"] as const).map((s) => (
          <Link key={s} href={`/admin/denuncias?status=${s}`} aria-current={s === status ? "page" : undefined} className={s === status ? "font-semibold text-fg underline underline-offset-4" : "text-fg-muted hover:text-fg"}>
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState title={t("empty")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-reports">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{tr(r.reason as "other")}</Badge>
                <span className="type-caption text-fg-muted">{formatDateTime(r.created_at, locale)}</span>
              </div>
              {r.content ? (
                <p className="text-sm text-fg">
                  {t("contentLabel")}{" "}
                  <Link href={`/admin/content/${r.content.id}`} className="font-semibold underline underline-offset-2">
                    {r.content.title}
                  </Link>{" "}
                  <span className="type-caption text-fg-muted">({r.content.status})</span>
                </p>
              ) : null}
              {r.creator ? (
                <p className="text-sm text-fg">
                  {t("heroLabel")}{" "}
                  <Link href={`/personalities/${r.creator.slug}`} className="font-semibold underline underline-offset-2">
                    {r.creator.name}
                  </Link>{" "}
                  <span className="type-caption text-fg-muted">({r.creator.status})</span>
                </p>
              ) : null}
              {r.details ? <p className="whitespace-pre-wrap rounded-lg bg-surface-elevated p-2 type-body-sm text-fg">{r.details}</p> : null}
              {r.status === "new" ? <ReportResolveButtons id={r.id} hasContent={Boolean(r.content)} hasCreator={Boolean(r.creator)} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
