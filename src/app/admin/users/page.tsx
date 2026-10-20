import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin";
import { PaginationNav } from "@/components/admin-ops/PaginationNav";
import { Badge, Button, Input, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import type { FnReturns } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.users")}` };
}

type SearchParams = Promise<{ q?: string; page?: string }>;
type UserRow = FnReturns<"admin_list_users">[number];
const PAGE_SIZE = 25;

// Lista paginada de usuários via RPC admin_list_users (e-mails só aqui).
export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, page: rawPage } = await searchParams;
  const search = (q ?? "").trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const [t, ta, tn, locale] = await Promise.all([getTranslations("adminOps.users"), getTranslations("adminCommon.table"), getTranslations("nav"), getLocale()]);
  const supabase = await createClient();
  // Pede um a mais para saber se há próxima página.
  const { data, error } = await supabase.rpc("admin_list_users", { p_search: search || undefined, p_limit: PAGE_SIZE + 1, p_offset: (page - 1) * PAGE_SIZE });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const hasNext = (data ?? []).length > PAGE_SIZE;

  const columns: Column<UserRow>[] = [
    {
      key: "user",
      header: t("columns.user"),
      cell: (u) => (
        <Link href={`/admin/users/${u.id}`} className="flex min-w-0 flex-col rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <span className="truncate font-medium text-accent-text hover:underline">{u.email ?? "—"}</span>
          <span className="truncate type-caption text-fg-muted">{u.display_name ?? "—"}</span>
        </Link>
      ),
    },
    { key: "created", header: t("columns.created"), hideOnMobile: true, cell: (u) => <span className="type-numeric text-fg-muted">{formatDateTime(u.created_at, locale)}</span> },
    {
      key: "lastSignIn",
      header: t("columns.lastSignIn"),
      hideOnMobile: true,
      cell: (u) => <span className="type-numeric text-fg-muted">{u.last_sign_in_at ? formatDateTime(u.last_sign_in_at, locale) : t("never")}</span>,
    },
    {
      key: "roles",
      header: t("columns.roles"),
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          {(u.roles ?? []).map((r) => (
            <Badge key={r} variant={r === "admin" ? "accent" : r === "consumer" ? "neutral" : "info"} size="sm">
              {t.has(`roles.${r}`) ? t(`roles.${r}`) : r}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "anonymized",
      header: t("columns.anonymized"),
      hideOnMobile: true,
      cell: (u) =>
        u.anonymized ? (
          <Badge variant="warning" size="sm">
            {t("columns.anonymized")}
          </Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.admin")} />
      <form method="get" action="/admin/users" role="search" className="flex max-w-xl gap-2">
        <label htmlFor="users-search" className="sr-only">
          {t("search")}
        </label>
        <Input id="users-search" name="q" type="search" defaultValue={search} placeholder={t("searchPlaceholder")} leadingIcon={<Search />} autoComplete="off" />
        <Button type="submit" variant="secondary">
          {t("searchButton")}
        </Button>
      </form>
      <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} caption={t("tableCaption")} emptyTitle={t("empty")} emptyDescription={search ? ta("noResultsDescription") : t("emptyDescription")} />
      <PaginationNav basePath="/admin/users" params={{ q: search || undefined }} page={page} hasNext={hasNext} />
    </div>
  );
}
