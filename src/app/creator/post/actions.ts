"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { CAPTION_MAX, MAX_POST_BYTES, MAX_POST_SECONDS, SERVER_MAX_POST_SECONDS, TITLE_MAX, durationMinutes } from "@/components/creator/post/validation";
import { LOCALE_VALUES, PILLAR_VALUES } from "@/components/editors/content/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { rpcErrorCode, type LocaleCode, type Pillar } from "@/lib/supabase/helpers";
import { getStreamProvider, thumbnailPath } from "@/lib/video";
import { failFrom, type ActionFailure } from "../_lib/action-utils";
import { insertCreatorContent } from "../_lib/content-insert";
import { creatorActionContext, type CreatorActionContext } from "../_lib/creator-action";
import { setDraftSlug } from "../_lib/draft-slug";
import { checkStreamVideo, providerFailure, readVideoUploadConfigured } from "../_lib/video-post";
import { schedulePushDispatch } from "@/lib/push/schedule";
import { hasUploadRights } from "@/lib/partner-terms/server";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";

// Composer de post em vídeo do herói. O ticket de upload, o vínculo uid → herói (stream_uploads,
// gravado só pelo service role) e o rascunho nascem juntos no servidor; o banco recusa corpo e
// publicação com uid sem esse vínculo (0026). O cliente só conhece o contentId.

type StartResult = { ok: true; contentId: string; uploadUrl: string } | ActionFailure;
type PublishResult = { ok: true; slug: string } | ActionFailure;
type DiscardResult = { ok: true; deleted: boolean } | ActionFailure;

/** Tickets por herói por hora; o gatilho de stream_uploads aplica o mesmo teto. */
const UPLOADS_PER_HOUR = 10;

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

type Admin = ReturnType<typeof createAdminClient>;

// Apaga o vídeo no Cloudflare e marca o envio. Melhor esforço: se falhar, a limpeza diária
// (cron de retenção) encontra o envio descartado sem provider_deleted_at e tenta de novo.
async function deleteProviderVideo(admin: Admin | null, uid: string): Promise<boolean> {
  try {
    await getStreamProvider().deleteVideo(uid);
  } catch (error) {
    console.warn("[post] falha ao apagar vídeo no Cloudflare", uid, (error as Error).message);
    return false;
  }
  if (admin) {
    const { error } = await admin.from("stream_uploads").update({ provider_deleted_at: new Date().toISOString() }).eq("uid", uid);
    if (error) console.warn("[post] falha ao marcar vídeo apagado", uid, error.message);
  }
  return true;
}

// Desfaz um ticket que não virou rascunho: envio descartado e vídeo apagado (nada fica órfão).
async function abandonUpload(admin: Admin, uid: string, contentId?: string) {
  if (contentId) await admin.from("content").delete().eq("id", contentId).eq("status", "draft");
  await admin.from("stream_uploads").update({ discarded_at: new Date().toISOString(), content_id: null }).eq("uid", uid);
  await deleteProviderVideo(admin, uid);
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

  const ctx = await creatorActionContext("post");
  if (!ctx.ok) return ctx;
  const { supabase, creatorId, userId } = ctx;
  // Termos do Parceiro (0068): o herói confirma os direitos antes do primeiro envio; o admin age pelo seletor
  if (!ctx.actingFor && !(await hasUploadRights(supabase, userId))) return { ok: false, error: UPLOAD_RIGHTS_REQUIRED };
  if (!(await readVideoUploadConfigured(supabase))) return { ok: false, error: "video_not_configured" };

  // Limite antes de pedir o ticket (a RLS deixa o herói contar os próprios envios); o gatilho do
  // banco segura corrida entre duas abas.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("stream_uploads")
    .select("uid", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .gte("created_at", since);
  if (countError) return failFrom(countError);
  if ((count ?? 0) >= UPLOADS_PER_HOUR) return { ok: false, error: "too_many_uploads" };

  let ticket;
  try {
    ticket = await getStreamProvider().createUploadUrl({ creatorId, maxDurationSec: MAX_POST_SECONDS, premium: false, fileSize, fileName });
  } catch (error) {
    return providerFailure(error, "upload");
  }
  const uid = ticket.mediaRef.id;

  // Vínculo uid → herói da sessão, só pelo service role. Sem ele o vídeo não serve para nada:
  // apaga no Cloudflare e devolve o erro.
  const admin = createAdminClient();
  const { error: linkError } = await admin.from("stream_uploads").insert({ uid, creator_id: creatorId, expires_at: ticket.expiresAt });
  if (linkError) {
    await deleteProviderVideo(null, uid);
    const code = rpcErrorCode(linkError.message);
    return { ok: false, error: code === "too_many_uploads" ? code : "upload_failed" };
  }

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
  if (!inserted.ok) {
    await abandonUpload(admin, uid);
    return inserted;
  }

  // Corpo com o cliente do usuário: o gatilho da 0026 confere o vínculo recém-gravado.
  const { error: bodyError } = await supabase.from("content_bodies").insert({
    content_id: inserted.id,
    body: { kind: "video", intro: "", key_points: [], transcript: [] } as unknown as NonNullable<Json>,
    media_provider: "cloudflare_stream",
    media_ref: uid,
    captions_url: null,
  });
  if (bodyError) {
    await abandonUpload(admin, uid, inserted.id);
    return failFrom(bodyError);
  }

  const { error: attachError } = await admin.from("stream_uploads").update({ content_id: inserted.id }).eq("uid", uid);
  if (attachError) console.warn("[post] falha ao ligar envio ao rascunho", uid, attachError.message);
  revalidatePost();
  return { ok: true, contentId: inserted.id, uploadUrl: ticket.uploadUrl };
}

type OwnDraft = { id: string; slug: string; status: string; creator_id: string | null; published_at: string | null };

async function loadOwnContent(ctx: CreatorActionContext, contentId: string): Promise<OwnDraft | ActionFailure> {
  const { data } = await ctx.supabase.from("content").select("id, slug, status, creator_id, published_at").eq("id", contentId).maybeSingle();
  // A RLS já esconde conteúdo de outros heróis; a comparação é a defesa extra (e não revela ids).
  if (!data || data.creator_id !== ctx.creatorId) return { ok: false, error: "forbidden" };
  return data as OwnDraft;
}

export async function publishVideoPost(input: { contentId: string; title: string; caption?: string; pillar: Pillar }): Promise<PublishResult> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "title") ? "missing_title" : "invalid_input" };
  const { contentId, title, caption, pillar } = parsed.data;

  const ctx = await creatorActionContext("post");
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

  // Só rascunho que nunca foi ao ar troca de slug: depois disso o link já pode ter circulado.
  if (content.published_at === null) {
    const slugFailure = await setDraftSlug(ctx, contentId, title);
    if (slugFailure) return slugFailure;
  }

  const { data: published, error } = await supabase.rpc("creator_publish_content", { p_content: contentId });
  if (error) return failFrom(error);
  const slug = (published as { slug?: string } | null)?.slug ?? content.slug;

  revalidatePost();
  revalidatePath("/inicio");
  revalidatePath("/explore");
  // post no ar: avisa quem favoritou o herói (fila enchida pelo banco, 0054)
  schedulePushDispatch();
  return { ok: true, slug };
}

export async function discardVideoPost(input: { contentId: string }): Promise<DiscardResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext("post");
  if (!ctx.ok) return ctx;

  // A RPC confere dono, rascunho nunca publicado e vídeo do Stream; apaga o conteúdo e marca o
  // envio como descartado. O vídeo no Cloudflare sai em seguida (melhor esforço).
  const { data, error } = await ctx.supabase.rpc("creator_discard_video_draft", { p_content: parsed.data.contentId });
  if (error) return failFrom(error);
  revalidatePost();

  const uid = (data as { uid?: string } | null)?.uid;
  if (uid) {
    let admin: Admin | null = null;
    try {
      admin = createAdminClient();
    } catch {
      admin = null; // sem service role a limpeza diária também não roda; o vídeo fica para o admin
    }
    await deleteProviderVideo(admin, uid);
  }
  return { ok: true, deleted: true };
}
