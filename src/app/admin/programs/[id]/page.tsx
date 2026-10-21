import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { Panel } from "@/components/admin-content";
import { ProgramDetailActions } from "@/components/admin-content/ProgramDetailActions";
import { NewVersionDialog, ProgramBasicsForm } from "@/components/admin-content/ProgramForms";
import { Badge, Button, PageHeader, PillarBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Detalhe do programa: dados básicos, lista de versões (status, nº, publicação, inscrições) e ações.

type Program = {
  id: string;
  slug: string;
  pillar: Enums<"pillar">;
  cover_url: string | null;
  status: Enums<"content_status">;
  is_featured: boolean;
  featured_rank: number | null;
  current_version_id: string | null;
  creator_id: string | null;
  creator: { name: string } | null;
};

type Version = {
  id: string;
  version_no: number;
  title: string;
  status: Enums<"content_status">;
  published_at: string | null;
  created_at: string;
  enrollments: { count: number }[];
  items: { count: number }[];
};

type Params = { params: Promise<{ id: string }> };

async function loadProgram(id: string): Promise<Program | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("id, slug, pillar, cover_url, status, is_featured, featured_rank, current_version_id, creator_id, creator:creator_profiles(name)")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Program | null) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const program = await loadProgram(id);
  return { title: program?.slug ?? "" };
}

export default async function AdminProgramDetailPage({ params }: Params) {
  const { id } = await params;
  const program = await loadProgram(id);
  if (!program) notFound();
  const supabase = await createClient();
  const [t, tc, ts, locale, versionsRes, creatorsRes] = await Promise.all([
    getTranslations("adminContent.programs"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon"),
    getLocale(),
    supabase
      .from("program_versions")
      .select("id, version_no, title, status, published_at, created_at, enrollments(count), items:program_items(count)")
      .eq("program_id", id)
      .order("version_no", { ascending: false }),
    supabase.from("creator_profiles").select("id, name").order("name"),
  ]);
  const versions = (versionsRes.data ?? []) as unknown as Version[];
  const current = versions.find((v) => v.id === program.current_version_id) ?? null;

  const columns: Column<Version>[] = [
    {
      key: "version",
      header: t("detail.versionNo"),
      cell: (v) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/admin/programs/${program.id}/versions/${v.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {tc("version", { n: v.version_no })} · {v.title}
          </Link>
          <span className="text-xs text-fg-muted">{t("detail.items", { n: v.items?.[0]?.count ?? 0 })}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("detail.status"),
      cell: (v) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={v.status} label={ts(`status.${v.status}`)} />
          {v.id === program.current_version_id && (
            <Badge variant="accent" size="sm">
              {t("detail.current")}
            </Badge>
          )}
        </span>
      ),
    },
    { key: "published", header: t("detail.publishedAt"), hideOnMobile: true, cell: (v) => (v.published_at ? formatDate(v.published_at, locale as Locale) : tc("none")) },
    { key: "enrollments", header: t("detail.enrollments"), align: "right", cell: (v) => <span className="type-numeric">{v.enrollments?.[0]?.count ?? 0}</span> },
    {
      key: "open",
      header: tc("actions"),
      align: "right",
      cell: (v) => (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/programs/${program.id}/versions/${v.id}`}>{t("detail.openVersion")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("detail.eyebrow")}
        title={current?.title ?? program.slug}
        description={program.slug}
        backHref="/admin/programs"
        backLabel={tc("backToList")}
        actions={<NewVersionDialog programId={program.id} versions={versions.map((v) => ({ id: v.id, version_no: v.version_no, title: v.title }))} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <PillarBadge tone="pillar" pillar={program.pillar} size="sm" />
          <StatusBadge status={program.status} label={ts(`status.${program.status}`)} />
          {program.is_featured && (
            <Badge variant="accent" size="sm">
              ★ {program.featured_rank ?? ""}
            </Badge>
          )}
          <span className="type-caption text-fg-muted">{program.creator?.name ?? tc("noCreator")}</span>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("detail.versions")}>
            <DataTable columns={columns} rows={versions} rowKey={(v) => v.id} caption={t("detail.versionsCaption")} emptyTitle={t("detail.noVersions")} />
          </Panel>
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title={tc("actions")}>
            <ProgramDetailActions programId={program.id} status={program.status} isFeatured={program.is_featured} />
          </Panel>
          <Panel title={t("detail.basics")}>
            <ProgramBasicsForm
              programId={program.id}
              creators={creatorsRes.data ?? []}
              initial={{ slug: program.slug, creator_id: program.creator_id, pillar: program.pillar, cover_url: program.cover_url }}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
