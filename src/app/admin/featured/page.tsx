import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/admin-content";
import { FeaturedList, type FeaturedRow } from "@/components/admin-content/FeaturedList";
import { ContentCard, ProgramCard } from "@/components/catalog";
import { PageHeader } from "@/components/ui";
import { CONTENT_CARD_SELECT, PROGRAM_CARD_SELECT, type ContentCardData, type ProgramCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

// Destaques do Início: duas listas ordenadas (conteúdos e programas) + prévia na ordem exibida.

type ContentFeatured = { id: string; title: string; status: string; featured_rank: number | null; creator: { name: string } | null };
type ProgramFeatured = { id: string; slug: string; status: string; featured_rank: number | null; version: { title: string } | null };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.featured");
  return { title: t("title") };
}

export default async function AdminFeaturedPage() {
  const supabase = await createClient();
  const [t, contentRes, programsRes, previewContentRes, previewProgramsRes] = await Promise.all([
    getTranslations("adminContent.featured"),
    supabase
      .from("content")
      .select("id, title, status, featured_rank, creator:creator_profiles(name)")
      .eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("published_at", { ascending: false }),
    supabase
      .from("programs")
      .select("id, slug, status, featured_rank, version:program_versions!programs_current_version_fk(title)")
      .eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false }),
    supabase.from("content").select(CONTENT_CARD_SELECT).eq("is_featured", true).eq("status", "published").order("featured_rank", { ascending: true, nullsFirst: false }).limit(12),
    supabase.from("programs").select(PROGRAM_CARD_SELECT).eq("is_featured", true).eq("status", "published").order("featured_rank", { ascending: true, nullsFirst: false }).limit(12),
  ]);
  if (contentRes.error) throw new Error(contentRes.error.message);
  if (programsRes.error) throw new Error(programsRes.error.message);

  const contentRows: FeaturedRow[] = ((contentRes.data ?? []) as unknown as ContentFeatured[]).map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.creator?.name ?? null,
    status: c.status,
    rank: c.featured_rank,
    href: `/admin/content/${c.id}`,
  }));
  const programRows: FeaturedRow[] = ((programsRes.data ?? []) as unknown as ProgramFeatured[]).map((p) => ({
    id: p.id,
    title: p.version?.title ?? p.slug,
    subtitle: p.slug,
    status: p.status,
    rank: p.featured_rank,
    href: `/admin/programs/${p.id}`,
  }));
  const previewContent = (previewContentRes.data ?? []) as unknown as ContentCardData[];
  const previewPrograms = (previewProgramsRes.data ?? []) as unknown as ProgramCardData[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <p className="type-caption text-fg-muted">{t("onlyPublished")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("content")}>
          <FeaturedList kind="content" rows={contentRows} />
        </Panel>
        <Panel title={t("programs")}>
          <FeaturedList kind="program" rows={programRows} />
        </Panel>
      </div>
      <Panel title={t("preview")} description={t("previewDescription")}>
        <div className="flex flex-col gap-4">
          {previewContent.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("content")}>
              {previewContent.map((c, i) => (
                <li key={c.id}>
                  <ContentCard content={c} priority={i === 0} />
                </li>
              ))}
            </ul>
          )}
          {previewPrograms.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label={t("programs")}>
              {previewPrograms.map((p) => (
                <li key={p.id}>
                  <ProgramCard program={p} />
                </li>
              ))}
            </ul>
          )}
          {previewContent.length === 0 && previewPrograms.length === 0 && <p className="text-sm text-fg-muted">{t("empty")}</p>}
        </div>
      </Panel>
    </div>
  );
}
