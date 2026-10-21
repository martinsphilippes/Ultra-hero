"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseContentForm, stripNutritionValidation } from "@/components/editors/content/schema";
import type { ActionResult, ContentFormValues } from "@/components/editors/types";
import { getUser } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";
import { insertCreatorContent } from "../_lib/content-insert";
import { creatorActionContext } from "../_lib/creator-action";
import { setDraftSlug } from "../_lib/draft-slug";
import { checkStreamVideo, readVideoUploadConfigured } from "../_lib/video-post";

// Ações do herói sobre conteúdo. O herói grava rascunhos próprios e publica/despublica direto
// (RPCs da 0025); regra de acesso e arquivamento continuam com o admin (RLS + guards de coluna).

type SaveResult = ActionResult & { id?: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

// Colunas que a personalidade pode escrever (espelha trg_a_content_guard).
function creatorColumns(v: ContentFormValues) {
  return {
    title: v.title,
    summary: v.summary || null,
    cover_url: v.cover_url || null,
    duration_minutes: v.duration_minutes,
    difficulty: v.difficulty,
    tags: v.tags,
    has_captions: v.has_captions,
    pillar: v.pillar,
    type: v.type,
    source_locale: v.source_locale,
    disclaimer_kind: v.disclaimer_kind,
    media_license_kind: v.media_license_kind,
    media_license_ref: v.media_license_ref || null,
    media_credit: v.media_credit || null,
  };
}

async function saveBody(supabase: Supabase, contentId: string, v: ContentFormValues): Promise<string | null> {
  const { error } = await supabase.from("content_bodies").upsert(
    {
      content_id: contentId,
      body: v.body as unknown as NonNullable<Json>,
      media_provider: v.media.provider,
      media_ref: v.media.ref,
      captions_url: v.media.captions_url,
    },
    { onConflict: "content_id" },
  );
  return error ? failFrom(error).error : null;
}

function revalidateContent(id?: string) {
  revalidatePath("/creator");
  revalidatePath("/creator/content");
  revalidatePath("/creator/links");
  if (id) revalidatePath(`/creator/content/${id}/edit`);
}

export async function createContent(values: ContentFormValues): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  // A personalidade nunca valida nutrição (RB-08): a marcação é zerada antes de validar e gravar.
  const parsed = parseContentForm(stripNutritionValidation(values));
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;

  // Vídeo do Cloudflare só nasce pelo composer (/creator/post/new), que cria o ticket no servidor.
  if (v.media.provider === "cloudflare_stream") return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data: creatorId } = await supabase.rpc("my_creator_id");
  if (!creatorId) return { ok: false, error: "creator_unavailable" };

  const inserted = await insertCreatorContent(supabase, { creator_id: creatorId, created_by: user.id, ...creatorColumns(v) });
  if (!inserted.ok) return inserted;
  const contentId = inserted.id;

  const bodyError = await saveBody(supabase, contentId, v);
  revalidateContent(contentId);
  if (bodyError) return { ok: false, error: bodyError, id: contentId };
  return { ok: true, id: contentId };
}

export async function updateContent(values: ContentFormValues): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const parsed = parseContentForm(stripNutritionValidation(values));
  if (!parsed.ok || !parsed.data.id) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  const id = v.id as string;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("content").select("id, status, review_status").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };
  // Mesma regra do guard do banco; evita gravar o corpo de algo em revisão.
  if (existing.status !== "draft" || existing.review_status === "in_review") return { ok: false, error: "content_not_editable" };
  // O uid do Cloudflare fica preso ao rascunho: o formulário pode manter o vídeo enviado, nunca trocar por outro uid.
  if (v.media.provider === "cloudflare_stream") {
    const { data: current } = await supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", id).maybeSingle();
    if (current?.media_provider !== "cloudflare_stream" || current.media_ref !== v.media.ref) return { ok: false, error: "forbidden" };
  }

  const { error } = await supabase.from("content").update(creatorColumns(v)).eq("id", id);
  if (error) return failFrom(error);

  const bodyError = await saveBody(supabase, id, v);
  revalidateContent(id);
  if (bodyError) return { ok: false, error: bodyError, id };
  return { ok: true, id };
}

// O herói publica direto (0025): o banco confere dono, título, corpo, mídia e licença.
export async function publishContent(input: { id: string }): Promise<ActionResult & { slug?: string }> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { supabase, creatorId } = ctx;
  const id = parsed.data.id;

  // Vídeo enviado pelo celular só vai ao ar pronto no Cloudflare (mesma regra do composer).
  const { data: body } = await supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", id).maybeSingle();
  if (body?.media_provider === "cloudflare_stream") {
    if (!(await readVideoUploadConfigured(supabase))) return { ok: false, error: "video_not_configured" };
    const video = await checkStreamVideo(body.media_ref, creatorId);
    if (!video.ok) return video;
    // Rascunho do composer publicado pelo editor (ex.: saiu da tela enquanto processava): troca o
    // slug provisório pelo do título atual, como o composer faz, enquanto nunca foi ao ar.
    const { data: row } = await supabase.from("content").select("title, published_at").eq("id", id).maybeSingle();
    if (row && row.published_at === null && row.title?.trim()) {
      const slugFailure = await setDraftSlug(ctx, id, row.title);
      if (slugFailure) return slugFailure;
    }
  }

  const { data, error } = await supabase.rpc("creator_publish_content", { p_content: id });
  if (error) return failFrom(error);
  revalidateContent(id);
  revalidatePath("/");
  revalidatePath("/explore");
  return { ok: true, slug: (data as { slug?: string } | null)?.slug };
}

// Despublicar volta o conteúdo a rascunho editável; publicar de novo usa a mesma checagem.
export async function unpublishContent(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.rpc("creator_unpublish_content", { p_content: parsed.data.id });
  if (error) return failFrom(error);
  revalidateContent(parsed.data.id);
  revalidatePath("/");
  revalidatePath("/explore");
  return { ok: true };
}
