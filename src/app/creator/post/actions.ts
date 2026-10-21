"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { CAPTION_MAX, MAX_POST_BYTES, MAX_POST_SECONDS, SERVER_MAX_POST_SECONDS, TITLE_MAX, durationMinutes } from "@/components/creator/post/validation";
import { LOCALE_VALUES, PILLAR_VALUES } from "@/components/editors/content/schema";
import type { Json } from "@/lib/supabase/database.types";
import type { LocaleCode, Pillar } from "@/lib/supabase/helpers";
import { getStreamProvider, thumbnailPath } from "@/lib/video";
import { failFrom, type ActionFailure } from "../_lib/action-utils";
import { insertCreatorContent } from "../_lib/content-insert";
import { creatorActionContext, type CreatorActionContext } from "../_lib/creator-action";
import { checkStreamVideo, providerFailure, readVideoUploadConfigured } from "../_lib/video-post";

// Composer de post em vídeo do herói. O ticket de upload e o rascunho nascem juntos no servidor:
// o uid do Cloudflare fica preso ao rascunho do dono no banco e o cliente só conhece o contentId.

type StartResult = { ok: true; contentId: string; uploadUrl: string } | ActionFailure;
type PublishResult = { ok: true; slug: string } | ActionFailure;
type DiscardResult = { ok: true; deleted: boolean } | ActionFailure;

const startSchema = z.object({
  fileSize: z.number().int().positive().max(MAX_POST_BYTES),
  fileName: z.string().max(255).optional().default(""),
  durationSec: z.number().nonnegative().max(86_400).nullable().optional().default(null),
});

const publishSchema = z.object({
  contentId: z.uuid(),
  title: z.string().trim().min(1).max(TITLE_MAX),
  caption: z.string().trim().max(CAPTION_MAX).optional().default(""),
  pillar: z.enum(PILLAR_VALUES),
});

const idSchema = z.object({ contentId: z.uuid() });

function revalidatePost() {
  revalidatePath("/creator");
  revalidatePath("/creator/content");
}

export async function startVideoPost(input: { fileSize: number; fileName?: string; durationSec?: number | null }): Promise<StartResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    const tooBig = typeof input?.fileSize === "number" && input.fileSize > MAX_POST_BYTES;
    return { ok: false, error: tooBig ? "file_too_large" : "invalid_input" };
  }
  const { fileSize, fileName, durationSec } = parsed.data;
  // O cliente já barra; aqui é a defesa para quem chama a action direto.
  if (durationSec !== null && durationSec > SERVER_MAX_POST_SECONDS) return { ok: false, error: "too_long" };

  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { supabase, creatorId, userId } = ctx;
  if (!(await readVideoUploadConfigured(supabase))) return { ok: false, error: "video_not_configured" };

  let ticket;
  try {
    ticket = await getStreamProvider().createUploadUrl({ creatorId, maxDurationSec: MAX_POST_SECONDS, premium: false, fileSize, fileName });
  } catch (error) {
    return providerFailure(error, "upload");
  }
  const uid = ticket.mediaRef.id;

  const [{ data: profile }, t, locale] = await Promise.all([
    supabase.from("creator_profiles").select("pillars").eq("id", creatorId).maybeSingle(),
    getTranslations("creator.post"),
    getLocale(),
  ]);
  const pillar: Pillar = (profile?.pillars as Pillar[] | null | undefined)?.[0] ?? "routine";
  const sourceLocale: LocaleCode = (LOCALE_VALUES as readonly string[]).includes(locale) ? (locale as LocaleCode) : "pt-BR";

  const inserted = await insertCreatorContent(supabase, {
    creator_id: creatorId,
    created_by: userId,
    title: t("draftTitle"),
    summary: null,
    type: "video",
    pillar,
    source_locale: sourceLocale,
    cover_url: thumbnailPath(uid),
    duration_minutes: durationMinutes(durationSec),
    tags: [],
    has_captions: false,
    media_license_kind: "own",
  });
  if (!inserted.ok) return inserted;

  const { error: bodyError } = await supabase.from("content_bodies").insert({
    content_id: inserted.id,
    body: { kind: "video", intro: "", key_points: [], transcript: [] } as unknown as NonNullable<Json>,
    media_provider: "cloudflare_stream",
    media_ref: uid,
    captions_url: null,
  });
  revalidatePost();
  if (bodyError) return failFrom(bodyError);
  return { ok: true, contentId: inserted.id, uploadUrl: ticket.uploadUrl };
}

type OwnDraft = { id: string; slug: string; status: string; creator_id: string | null };

async function loadOwnContent(ctx: CreatorActionContext, contentId: string): Promise<OwnDraft | ActionFailure> {
  const { data } = await ctx.supabase.from("content").select("id, slug, status, creator_id").eq("id", contentId).maybeSingle();
  // A RLS já esconde conteúdo de outros heróis; a comparação é a defesa extra (e não revela ids).
  if (!data || data.creator_id !== ctx.creatorId) return { ok: false, error: "forbidden" };
  return data as OwnDraft;
}

export async function publishVideoPost(input: { contentId: string; title: string; caption?: string; pillar: Pillar }): Promise<PublishResult> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "title") ? "missing_title" : "invalid_input" };
  const { contentId, title, caption, pillar } = parsed.data;

  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { supabase, creatorId } = ctx;

  const content = await loadOwnContent(ctx, contentId);
  if ("ok" in content) return content;
  // Segundo toque depois de publicar (rede lenta): devolve o mesmo resultado.
  if (content.status === "published") return { ok: true, slug: content.slug };
  if (content.status !== "draft") return { ok: false, error: "not_draft" };

  // Texto salvo antes da checagem do vídeo: se a pessoa sair enquanto processa, nada se perde.
  const { error: updateError } = await supabase.from("content").update({ title, summary: caption || null, pillar }).eq("id", contentId);
  if (updateError) return failFrom(updateError);

  const { data: body } = await supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", contentId).maybeSingle();
  if (!body || body.media_provider !== "cloudflare_stream") return { ok: false, error: "missing_media" };
  if (!(await readVideoUploadConfigured(supabase))) return { ok: false, error: "video_not_configured" };

  const video = await checkStreamVideo(body.media_ref, creatorId);
  if (!video.ok) return video;
  const minutes = durationMinutes(video.durationSec);
  if (minutes !== null) await supabase.from("content").update({ duration_minutes: minutes }).eq("id", contentId);

  const { data: published, error } = await supabase.rpc("creator_publish_content", { p_content: contentId });
  if (error) return failFrom(error);
  const slug = (published as { slug?: string } | null)?.slug ?? content.slug;

  revalidatePost();
  revalidatePath("/");
  revalidatePath("/explore");
  return { ok: true, slug };
}

export async function discardVideoPost(input: { contentId: string }): Promise<DiscardResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;

  const content = await loadOwnContent(ctx, parsed.data.contentId);
  if ("ok" in content) return content;
  if (content.status !== "draft") return { ok: false, error: "not_draft" };

  // Hoje a RLS só deixa o admin apagar conteúdo (content_delete_admin): para o herói o delete não
  // afeta linha nenhuma e o rascunho fica em "Meus conteúdos". Se a regra mudar, passa a apagar.
  const { data: removed, error } = await ctx.supabase.from("content").delete().eq("id", content.id).select("id");
  revalidatePost();
  if (error) return { ok: true, deleted: false };
  return { ok: true, deleted: (removed ?? []).length > 0 };
}
