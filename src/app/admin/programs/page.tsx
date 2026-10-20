import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { FilterBar, type FilterField } from "@/components/admin-content";
import { hasAnyFilter, pickEnum, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { Badge, Button, PageHeader, PillarBadge } from "@/components/ui";
import { PILLARS, type Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Lista de programas: título da versão atual, pilar, personalidade, status, nº de versões e inscrições.

const STATES = ["draft", "published", "archived"] as const;

type Row = {
  id: string;
  slug: string;
  pillar: Enums<"pillar">;
  status: Enums<"content_status">;
  is_featured: boolean;
  creator: { name: string } | null;
  version: { title: string; version_no: number } | null;
  versions: { count: number }[];
  enrollments: { count: number }[];
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.programs");
  return { title: t("title") };
}

export default async function AdminProgramsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [t, tc, ts, tp] = await Promise.all([
    getTranslations("adminContent.programs"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon"),
    getTranslations("common.pillars"),
  ]);
  const supabase = await createClient();
  const status = pickEnum(params, "status", STATES);
  const pillar = pickEnum(params, "pillar", PILLARS);
  const creator = pickUuid(params, "creator");

  let query = supabase
    .from("programs")
    .select(
      "id, slug, pillar, status, is_featured, creator:creator_profiles(name), version:program_versions!programs_current_version_fk(title, version_no), versions:program_versions!program_versions_program_id_fkey(count), enrollments(count)",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  if (pillar) query = query.eq("pillar", pillar);
  if (creator) query = query.eq("creator_id", creator);

  const [listRes, creatorsRes] = await Promise.all([query, supabase.from("creator_profiles").select("id, name").order("name")]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as Row[];

  const fields: FilterField[] = [
    { name: "status", label: tc("status"), type: "select", value: status ?? "", options: STATES.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "pillar", label: tc("pillar"), type: "select", value: pillar ?? "", options: PILLARS.map((p) => ({ value: p, label: tp(p) })) },
    { name: "creator", label: tc("creator"), type: "select", value: creator ?? "", options: (creatorsRes.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
  ];

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: t("table.title"),
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/admin/programs/${row.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.version?.title ?? t("table.noVersion")}
          </Link>
          <span className="truncate text-xs text-fg-muted">
            {row.slug}
            {row.is_featured ? " · ★" : ""}
          </span>
        </div>
      ),
    },
    { key: "pillar", header: t("table.pillar"), hideOnMobile: true, cell: (row) => <PillarBadge pillar={row.pillar} size="sm" /> },
    { key: "creator", header: t("table.creator"), hideOnMobile: true, cell: (row) => row.creator?.name ?? tc("noCreator") },
    { key: "status", header: t("table.status"), cell: (row) => <StatusBadge status={row.status} label={ts(`status.${row.status}`)} /> },
    { key: "versions", header: t("table.versions"), align: "right", cell: (row) => <Badge size="sm">{row.versions?.[0]?.count ?? 0}</Badge> },
    { key: "enrollments", header: t("table.enrollments"), align: "right", cell: (row) => <span className="type-numeric">{row.enrollments?.[0]?.count ?? 0}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild size="sm" leadingIcon={<Plus />}>
            <Link href="/admin/programs/new">{t("new")}</Link>
          </Button>
        }
      />
      <FilterBar action="/admin/programs" fields={fields} active={hasAnyFilter(params, ["status", "pillar", "creator"])} />
      <p className="type-caption text-fg-muted" aria-live="polite">
        {tc("results", { n: rows.length })}
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("table.caption")} emptyTitle={ts("table.noResults")} emptyDescription={ts("table.noResultsDescription")} />
    </div>
  );
}
