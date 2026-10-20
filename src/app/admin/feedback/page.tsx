import { Star } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { PaginationNav } from "@/components/admin-ops/PaginationNav";
import { FeedbackStatusButtons } from "@/components/admin-ops/StatusActions";
import { Button, Input, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import type { Tables } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.feedback")}` };
}

const STATUSES = ["new", "reviewed", "archived"] as const;
type Status = (typeof STATUSES)[number];
type SearchParams = Promise<{ status?: string; rating?: string; context?: string; page?: string }>;
type FeedbackRow = Tables<"feedback">;
const PAGE_SIZE = 25;

// Feedback dos usuários: filtros (status, nota, prefixo de contexto), sem PII além do id do usuário.
export default async function AdminFeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as Status) : undefined;
  const rating = /^[1-5]$/.test(sp.rating ?? "") ? Number(sp.rating) : undefined;
  const context = (sp.context ?? "").trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [t, tc, ts, tn, locale] = await Promise.all([
    getTranslations("adminOps.feedback"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
    getLocale(),
  ]);
  const supabase = await createClient();
  let query = supabase
    .from("feedback")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (rating) query = query.eq("rating", rating);
  if (context) query = query.ilike("context", `${context.replace(/[%_]/g, "\\$&")}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FeedbackRow[];

  const columns: Column<FeedbackRow>[] = [
    { key: "date", header: t("columns.date"), cell: (f) => <span className="type-numeric text-fg-muted">{formatDateTime(f.created_at, locale)}</span> },
    { key: "context", header: t("columns.context"), cell: (f) => <span className="break-all font-mono text-xs text-fg">{f.context}</span> },
    {
      key: "rating",
      header: t("columns.rating"),
      cell: (f) =>
        f.rating ? (
          <span className="inline-flex items-center gap-1 text-fg" aria-label={t("rating", { rating: f.rating })}>
            <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
            <span className="type-numeric">{f.rating}</span>
          </span>
        ) : (
          <span className="type-caption text-fg-subtle">{t("noRating")}</span>
        ),
    },
    {
      key: "message",
      header: t("columns.message"),
      className: "md:max-w-md",
      cell: (f) => (f.message ? <span className="line-clamp-3 whitespace-pre-wrap text-sm text-fg">{f.message}</span> : <span className="type-caption text-fg-subtle">{t("noMessage")}</span>),
    },
    { key: "locale", header: t("columns.locale"), hideOnMobile: true, cell: (f) => <span className="text-fg-muted">{f.locale ?? "—"}</span> },
    {
      key: "user",
      header: t("columns.user"),
      hideOnMobile: true,
      cell: (f) =>
        f.user_id ? (
          <Link href={`/admin/users/${f.user_id}`} className="font-mono text-xs text-accent-text hover:underline">
            {f.user_id.slice(0, 8)}…
          </Link>
        ) : (
          <span className="type-caption text-fg-subtle">{t("anonymous")}</span>
        ),
    },
    { key: "status", header: t("columns.status"), cell: (f) => <StatusBadge status={f.status} label={ts.has(f.status) ? ts(f.status) : f.status} /> },
    { key: "actions", header: "", align: "right", cell: (f) => <FeedbackStatusButtons id={f.id} status={f.status as Status} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.admin")} />
      <form method="get" action="/admin/feedback" aria-label={tc("filters")} className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-status" className="text-sm font-semibold text-fg">
            {t("filters.status")}
          </label>
          <Select id="f-status" name="status" defaultValue={status ?? ""}>
            <option value="">{tc("all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-rating" className="text-sm font-semibold text-fg">
            {t("filters.rating")}
          </label>
          <Select id="f-rating" name="rating" defaultValue={rating ? String(rating) : ""}>
            <option value="">{t("filters.anyRating")}</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {t("rating", { rating: r })}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-context" className="text-sm font-semibold text-fg">
            {t("filters.context")}
          </label>
          <Input id="f-context" name="context" defaultValue={context} placeholder={t("filters.contextPlaceholder")} autoComplete="off" />
        </div>
        <div className="flex gap-2">
          <Button type="submit">
            {tc("apply")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/feedback">{tc("clear")}</Link>
          </Button>
        </div>
      </form>
      <DataTable columns={columns} rows={rows} rowKey={(f) => f.id} caption={t("tableCaption")} emptyTitle={t("empty")} emptyDescription={t("emptyDescription")} />
      <PaginationNav
        basePath="/admin/feedback"
        params={{ status, rating: rating ? String(rating) : undefined, context: context || undefined }}
        page={page}
        hasNext={(count ?? 0) > page * PAGE_SIZE}
        total={count ?? undefined}
      />
    </div>
  );
}
