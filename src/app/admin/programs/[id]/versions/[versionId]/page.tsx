import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin";
import { Panel } from "@/components/admin-content";
import { PublishVersionButton } from "@/components/admin-content/ProgramDetailActions";
import { ProgramVersionFields } from "@/components/admin-content/ProgramForms";
import { ProgramConceptForm } from "@/components/admin-content/ProgramConceptFields";
import { ProgramItemsEditor, SubstitutionsPanel, type Substitution, type VersionItem } from "@/components/admin-content/ProgramItemsEditor";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { conceptColumnSupported } from "@/lib/programs/concept-query";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Editor da versão: campos, itens (congelados se publicada), substituições e publicação.

type Version = {
  id: string;
  program_id: string;
  version_no: number;
  title: string;
  summary: string | null;
  description: string | null;
  estimated_weeks: number | null;
  certificate_fields: unknown;
  status: Enums<"content_status">;
  published_at: string | null;
  enrollments: { count: number }[];
};

type Params = { params: Promise<{ id: string; versionId: string }> };

const CERT_FIELDS = ["display_name", "program_title", "completed_at", "version", "pillar"] as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { versionId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("program_versions").select("title").eq("id", versionId).maybeSingle();
  return { title: data?.title ?? "" };
}

export default async function AdminProgramVersionPage({ params }: Params) {
  const { id, versionId } = await params;
  const supabase = await createClient();
  const [t, tc, ts, td, tconcept, locale, versionRes, itemsRes, subsRes, conceptRes] = await Promise.all([
    getTranslations("adminContent.programs.version"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon.status"),
    getTranslations("adminContent.programs.detail"),
    getTranslations("adminContent.programs.concept"),
    getLocale(),
    supabase
      .from("program_versions")
      .select("id, program_id, version_no, title, summary, description, estimated_weeks, certificate_fields, status, published_at, enrollments(count)")
      .eq("id", versionId)
      .eq("program_id", id)
      .maybeSingle(),
    supabase.from("program_items").select("id, content_id, position, section, is_required, content:content(id, title, type, status)").eq("version_id", versionId).order("position").order("id"),
    supabase
      .from("program_item_substitutions")
      .select("id, original_content_id, replacement_content_id, reason, created_at, original:content!program_item_substitutions_original_content_id_fkey(title), replacement:content!program_item_substitutions_replacement_content_id_fkey(title, status)")
      .eq("version_id", versionId)
      .order("created_at", { ascending: false }),
    // conceito à parte: sem a 0048 no banco o painel mostra o aviso em vez de quebrar a página
    conceptColumnSupported(supabase).then(async (ok) => (ok ? await supabase.from("program_versions").select("concept").eq("id", versionId).maybeSingle() : null)),
  ]);
  const version = (versionRes.data as unknown as Version | null) ?? null;
  if (!version) notFound();
  const items = (itemsRes.data ?? []) as unknown as VersionItem[];
  const substitutions = (subsRes.data ?? []) as unknown as Substitution[];
  const readOnly = version.status !== "draft";
  const certFields = Array.isArray(version.certificate_fields)
    ? (version.certificate_fields.filter((f): f is (typeof CERT_FIELDS)[number] => typeof f === "string" && (CERT_FIELDS as readonly string[]).includes(f)) as (typeof CERT_FIELDS)[number][])
    : [...CERT_FIELDS].slice(0, 4);
  const enrollments = version.enrollments?.[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow", { n: version.version_no })}
        title={version.title}
        description={version.summary ?? undefined}
        backHref={`/admin/programs/${id}`}
        backLabel={tc("program")}
        actions={version.status === "draft" ? <PublishVersionButton programId={id} versionId={version.id} disabled={items.length === 0} /> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={version.status} label={ts(version.status)} />
          <Badge size="sm">
            {td("enrollments")}: {enrollments}
          </Badge>
          {version.published_at && <span className="type-caption text-fg-muted">{tc("publishedAt", { date: formatDateTime(version.published_at, locale as Locale) })}</span>}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("items")} description={t("itemsDescription")}>
            <ProgramItemsEditor programId={id} versionId={version.id} items={items} readOnly={readOnly} />
          </Panel>
          <Panel title={t("substitutions")} description={t("substitutionsDescription")}>
            <SubstitutionsPanel programId={id} versionId={version.id} items={items} substitutions={substitutions} />
          </Panel>
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title={t("fields")}>
            <ProgramVersionFields
              programId={id}
              versionId={version.id}
              initial={{
                title: version.title,
                summary: version.summary ?? "",
                description: version.description ?? "",
                estimated_weeks: version.estimated_weeks,
                certificate_fields: certFields,
              }}
            />
          </Panel>
        </aside>
      </div>

      <Panel title={tconcept("title")} description={tconcept("description")}>
        {conceptRes && !conceptRes.error ? (
          <ProgramConceptForm programId={id} versionId={version.id} initial={conceptRes.data?.concept ?? null} />
        ) : (
          <p className="text-sm text-fg-muted">{tconcept("unsupported")}</p>
        )}
      </Panel>
    </div>
  );
}
