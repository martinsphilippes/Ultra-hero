import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminContentEditor } from "@/components/admin-content/AdminContentEditor";
import type { ContentFormValues } from "@/components/editors/types";
import { PageHeader } from "@/components/ui";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Edição completa pelo admin (ContentForm com canEditAccess + escolha da personalidade).

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content.form");
  return { title: t("editTitle") };
}

export default async function AdminContentEditPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tc, contentRes, bodyRes, modulesRes, creatorsRes] = await Promise.all([
    getTranslations("adminContent.content.form"),
    getTranslations("adminContent.common"),
    supabase
      .from("content")
      .select("id, title, summary, pillar, type, source_locale, cover_url, duration_minutes, difficulty, tags, has_captions, disclaimer_kind, access_level, required_module_id, completion_mode, creator_id")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("content_bodies").select("body, media_provider, media_ref, captions_url").eq("content_id", id).maybeSingle(),
    supabase.from("plan_modules").select("id, name, code").order("sort_order"),
    supabase.from("creator_profiles").select("id, name, is_fictional").order("name"),
  ]);
  const content = contentRes.data;
  if (!content) notFound();
  const body = bodyRes.data;

  const initial: Partial<ContentFormValues> = {
    id: content.id,
    title: content.title,
    summary: content.summary ?? "",
    pillar: content.pillar,
    type: content.type,
    source_locale: content.source_locale,
    cover_url: content.cover_url ?? "",
    duration_minutes: content.duration_minutes,
    difficulty: content.difficulty as ContentFormValues["difficulty"],
    tags: content.tags,
    has_captions: content.has_captions,
    disclaimer_kind: content.disclaimer_kind as ContentFormValues["disclaimer_kind"],
    body: (body?.body as Record<string, unknown> | null) ?? {},
    media: {
      provider: (body?.media_provider ?? "none") as Enums<"media_provider">,
      ref: body?.media_ref ?? null,
      captions_url: body?.captions_url ?? null,
    },
    access_level: content.access_level,
    required_module_id: content.required_module_id,
    completion_mode: content.completion_mode,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={content.title} title={t("editTitle")} description={t("editDescription")} backHref={`/admin/content/${content.id}`} backLabel={tc("view")} />
      <AdminContentEditor mode="edit" contentId={content.id} initial={initial} modules={modulesRes.data ?? []} creators={creatorsRes.data ?? []} initialCreatorId={content.creator_id} />
    </div>
  );
}
