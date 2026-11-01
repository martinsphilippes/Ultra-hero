import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminContentEditor } from "@/components/admin-content/AdminContentEditor";
import type { ContentFormValues } from "@/components/editors/types";
import { RecipeLegacyNotice } from "@/components/recipes/RecipeLegacyNotice";
import { PageHeader } from "@/components/ui";
import { loadPostBlocks } from "@/lib/post-blocks/queries";
import { draftsFromBlocks } from "@/lib/post-blocks/schema";
import { getPostPhotoState } from "@/lib/post-photo/availability";
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
  const [t, tc, contentRes, bodyRes, creatorsRes, coverState, blocks, linksRes] = await Promise.all([
    getTranslations("adminContent.content.form"),
    getTranslations("adminContent.common"),
    supabase
      .from("content")
      .select("id, title, summary, pillar, type, source_locale, cover_url, duration_minutes, difficulty, tags, has_captions, disclaimer_kind, completion_mode, creator_id, media_license_kind, media_license_ref, media_credit")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("content_bodies").select("body, media_provider, media_ref, captions_url").eq("content_id", id).maybeSingle(),
    supabase.from("creator_profiles").select("id, name, is_fictional").order("name"),
    getPostPhotoState(),
    // blocos (0075/0076) e produtos vinculados validados, para o formulário editar
    loadPostBlocks(supabase, id),
    supabase.from("content_product_links").select("product_id").eq("content_id", id).eq("status", "validated"),
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
    media_license_kind: content.media_license_kind as ContentFormValues["media_license_kind"],
    media_license_ref: content.media_license_ref ?? "",
    media_credit: content.media_credit ?? "",
    completion_mode: content.completion_mode,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={content.title} title={t("editTitle")} description={t("editDescription")} backHref={`/admin/content/${content.id}`} backLabel={tc("view")} />
      {/* Receita estruturada (0027): só leitura aqui até o editor de receitas (fase 2). */}
      {content.type === "recipe" && <RecipeLegacyNotice />}
      <AdminContentEditor
        mode="edit"
        contentId={content.id}
        initial={initial}
        creators={creatorsRes.data ?? []}
        initialCreatorId={content.creator_id}
        readOnly={content.type === "recipe"}
        coverState={coverState}
        initialBlocks={{ drafts: draftsFromBlocks(blocks), products: (linksRes.data ?? []).map((l) => l.product_id) }}
      />
    </div>
  );
}
