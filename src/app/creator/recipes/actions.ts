"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { parsePublishAt } from "@/components/admin-content/lib/publish-at";
import { LOCALE_VALUES } from "@/components/editors/content/schema";
import { MAX_POST_BYTES, MAX_POST_SECONDS, SERVER_MAX_POST_SECONDS } from "@/components/creator/post/validation";
import { recipeErrorCode } from "@/lib/recipes/codes";
import { RECIPE_MEDIA_BUCKET, parseRecipeMediaPath, sniffImageMime } from "@/lib/recipes/media";
import { recipePayloadSchema, payloadIssues } from "@/lib/recipes/payload";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { rpcErrorCode, type LocaleCode } from "@/lib/supabase/helpers";
import { getStreamProvider } from "@/lib/video";
import { failFrom } from "../_lib/action-utils";
import { insertCreatorContent } from "../_lib/content-insert";
import { creatorActionContext, type CreatorActionContext } from "../_lib/creator-action";
import { setDraftSlug } from "../_lib/draft-slug";
import { uniqueSlug } from "../_lib/slug";
import { checkStreamVideo, providerFailure, readVideoUploadConfigured } from "../_lib/video-post";

// Ações do Portal do Chef (receitas estruturadas, 0027/0028). Toda regra de dono, situação e
// checklist mora nas RPCs; aqui validamos a entrada (o mesmo Zod do editor), traduzimos o erro
// para um código de recipes.errors.* e revalidamos as telas. O herói vem sempre da sessão.

export type RecipeFailure = { ok: false; error: string; detail?: string };
type Ok<T = object> = { ok: true } & T;

const idSchema = z.uuid();
const PLACEHOLDER_COVER = "/placeholders/cover-gastronomy-1.svg";

/** Código + detalhe ("invalid_payload: ingredients.3.unit" → caminho; "recipe_incomplete: a,b" → itens). */
function recipeFail(error: { message?: string; code?: string } | string | null | undefined): RecipeFailure {
  const message = typeof error === "string" ? error : (error?.message ?? "");
  const code = recipeErrorCode(message);
  if (code) {
    const detail = message.includes(":") ? message.slice(message.indexOf(":") + 1).trim() : undefined;
    return { ok: false, error: code, ...(detail ? { detail } : {}) };
  }
  if (message.startsWith("media_license_mismatch")) return { ok: false, error: "media_license_mismatch" };
  if (/permission denied/i.test(message)) return { ok: false, error: "forbidden" };
  return failFrom(error);
}

function revalidateRecipe(id?: string) {
  revalidatePath("/creator");
  revalidatePath("/creator/recipes");
  revalidatePath("/creator/content");
  if (id) {
    revalidatePath(`/creator/recipes/${id}/edit`);
    revalidatePath(`/creator/recipes/${id}/preview`);
    revalidatePath(`/creator/recipes/${id}/versions`);
  }
}

function revalidatePublic(slug?: string | null) {
  revalidatePath("/");
  revalidatePath("/explore");
  if (slug) revalidatePath(`/content/${slug}`);
}

type OwnRecipe = { id: string; slug: string; title: string; status: string; review_status: string; published_at: string | null; creator_id: string | null; type: string; updated_at: string };

async function loadOwnRecipe(ctx: CreatorActionContext, id: string): Promise<OwnRecipe | RecipeFailure> {
  const { data } = await ctx.supabase.from("content").select("id, slug, title, status, review_status, published_at, creator_id, type, updated_at").eq("id", id).maybeSingle();
  // a RLS já esconde receita de outro herói; a comparação é a defesa extra (sem revelar ids)
  if (!data || data.creator_id !== ctx.creatorId) return { ok: false, error: "forbidden" };
  if (data.type !== "recipe") return { ok: false, error: "not_recipe" };
  return data as OwnRecipe;
}

function parsePayload(payload: unknown): { ok: true; data: z.infer<typeof recipePayloadSchema> } | RecipeFailure {
  const parsed = recipePayloadSchema.safeParse(payload);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = payloadIssues(parsed.error)[0];
  return { ok: false, error: "invalid_payload", detail: first?.path || "payload" };
}

// ---------------------------------------------------------------- criar e gravar

/** Passo 1: cria o rascunho (tipo receita, pilar gastronomia, capa placeholder) e grava os básicos. */
export async function createRecipeDraft(input: { payload: unknown }): Promise<Ok<{ id: string; updatedAt: string }> | RecipeFailure> {
  const parsed = parsePayload(input?.payload);
  if (!parsed.ok) return parsed;
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { supabase, creatorId, userId } = ctx;
  const locale = await getLocale();
  const sourceLocale: LocaleCode = (LOCALE_VALUES as readonly string[]).includes(locale) ? (locale as LocaleCode) : "pt-BR";
  const p = parsed.data;

  const inserted = await insertCreatorContent(supabase, {
    creator_id: creatorId,
    created_by: userId,
    title: p.content.title,
    summary: p.content.summary,
    type: "recipe",
    pillar: "gastronomy",
    source_locale: sourceLocale,
    cover_url: PLACEHOLDER_COVER,
    duration_minutes: p.details.total_minutes,
    difficulty: p.content.difficulty,
    tags: p.content.tags,
    has_captions: false,
    disclaimer_kind: "nutrition",
    media_license_kind: "own",
  });
  if (!inserted.ok) return recipeFail(inserted.error);

  const { data: row } = await supabase.from("content").select("updated_at").eq("id", inserted.id).maybeSingle();
  const { data, error } = await supabase.rpc("recipe_save", {
    p_content: inserted.id,
    p_payload: { ...p, content: { ...p.content, pillar: "gastronomy", media_license_kind: "own" } } as unknown as Json,
    p_expected_updated_at: row?.updated_at ?? "",
  });
  if (error) {
    // sem a gravação estruturada o rascunho não serve: some (o editor ainda tem os dados)
    await supabase.rpc("creator_delete_recipe_draft", { p_content: inserted.id });
    return recipeFail(error);
  }
  revalidateRecipe(inserted.id);
  return { ok: true, id: inserted.id, updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? row?.updated_at ?? "" };
}

/** Grava a receita inteira (recipe_save). `overwrite` relê o updated_at atual (diálogo de conflito). */
export async function saveRecipe(input: { id: string; payload: unknown; expectedUpdatedAt: string; overwrite?: boolean }): Promise<Ok<{ updatedAt: string }> | RecipeFailure> {
  const meta = z.object({ id: idSchema, expectedUpdatedAt: z.string().min(1).max(64), overwrite: z.boolean().optional() }).safeParse(input);
  if (!meta.success) return { ok: false, error: "invalid_input" };
  const parsed = parsePayload(input.payload);
  if (!parsed.ok) return parsed;
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, meta.data.id);
  if ("ok" in own) return own;
  const expected = meta.data.overwrite ? own.updated_at : meta.data.expectedUpdatedAt;
  const { data, error } = await ctx.supabase.rpc("recipe_save", {
    p_content: own.id,
    p_payload: parsed.data as unknown as Json,
    p_expected_updated_at: expected,
  });
  if (error) return recipeFail(error);
  revalidateRecipe(own.id);
  return { ok: true, updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? expected };
}

// ---------------------------------------------------------------- fotos (bucket privado recipe-media)

const registerSchema = z.object({
  contentId: idSchema,
  path: z.string().max(200),
  role: z.enum(["gallery", "step"]),
  alt: z.string().trim().max(200).optional().default(""),
  rights: z.literal(true),
  width: z.number().int().min(1).max(8000).nullable().optional().default(null),
  height: z.number().int().min(1).max(8000).nullable().optional().default(null),
});

export type RegisteredMedia = { id: string; role: "gallery" | "step"; position: number; alt: string; width: number | null; height: number | null };

/**
 * Depois do envio direto ao Storage (pelo navegador, sob as políticas da 0028): confere os bytes
 * mágicos contra a extensão (se não batem, apaga e recusa) e registra pela RPC, que lê tipo e
 * tamanho do próprio Storage. Qualquer recusa apaga o objeto (se sobrar, o cron de órfãos recolhe).
 */
export async function registerRecipeMedia(input: z.input<typeof registerSchema>): Promise<Ok<{ media: RegisteredMedia }> | RecipeFailure> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "rights") ? "rights_required" : "invalid_input" };
  const v = parsed.data;
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const path = parseRecipeMediaPath(v.path);
  if (!path || path.creatorId !== ctx.creatorId || path.contentId !== v.contentId) return { ok: false, error: "invalid_path" };
  const storage = ctx.supabase.storage.from(RECIPE_MEDIA_BUCKET);
  const removeObject = async () => {
    const { error } = await storage.remove([v.path]);
    if (error) console.warn("[recipes] falha ao apagar foto recusada", v.path, error.message);
  };

  const { data: blob, error: downloadError } = await storage.download(v.path);
  if (downloadError || !blob) return { ok: false, error: "object_not_found" };
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (sniffImageMime(head) !== path.mime) {
    await removeObject();
    return { ok: false, error: "invalid_image" };
  }

  const { data: mediaId, error } = await ctx.supabase.rpc("recipe_register_media", {
    p_content: v.contentId,
    p_path: v.path,
    p_role: v.role,
    p_alt: v.alt,
    p_rights: true,
    p_width: v.width as number,
    p_height: v.height as number,
  });
  if (error || typeof mediaId !== "string") {
    await removeObject();
    return recipeFail(error);
  }
  const { data: row } = await ctx.supabase.from("recipe_media").select("id, role, position, alt_text, width, height").eq("id", mediaId).maybeSingle();
  revalidateRecipe(v.contentId);
  return {
    ok: true,
    media: {
      id: mediaId,
      role: v.role,
      position: Number(row?.position ?? 1),
      alt: row?.alt_text ?? v.alt,
      width: row?.width ?? v.width,
      height: row?.height ?? v.height,
    },
  };
}

/** Apaga a linha (capa e foto de etapa ficam vazias) e o objeto. Devolve o updated_at novo. */
export async function deleteRecipeMedia(input: { mediaId: string }): Promise<Ok<{ updatedAt: string | null }> | RecipeFailure> {
  const parsed = z.object({ mediaId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { data: media } = await ctx.supabase.from("recipe_media").select("content_id").eq("id", parsed.data.mediaId).maybeSingle();
  const { data, error } = await ctx.supabase.rpc("recipe_delete_media", { p_media: parsed.data.mediaId });
  if (error) return recipeFail(error);
  const path = (data as { path?: string } | null)?.path;
  if (path) {
    const { error: removeError } = await ctx.supabase.storage.from(RECIPE_MEDIA_BUCKET).remove([path]);
    if (removeError) console.warn("[recipes] objeto fica para a limpeza de órfãos", path, removeError.message);
  }
  let updatedAt: string | null = null;
  if (media?.content_id) {
    const { data: row } = await ctx.supabase.from("content").select("updated_at").eq("id", media.content_id).maybeSingle();
    updatedAt = row?.updated_at ?? null;
    revalidateRecipe(media.content_id);
  }
  return { ok: true, updatedAt };
}

// ---------------------------------------------------------------- vídeo pelo Cloudflare Stream (mesmo fluxo do composer)

const UPLOADS_PER_HOUR = 10;

const videoSchema = z.object({
  contentId: idSchema,
  fileSize: z.number().int().positive().max(MAX_POST_BYTES),
  fileName: z.string().max(255).optional().default(""),
  durationSec: z.number().nonnegative().max(86_400).nullable().optional().default(null),
});

/**
 * Cria o ticket de envio (tus) já ligado a esta receita em stream_uploads (só o service role grava
 * o vínculo). O uid entra no corpo na próxima gravação do editor: a guarda da 0026 confere o vínculo.
 */
export async function startRecipeVideoUpload(input: z.input<typeof videoSchema>): Promise<Ok<{ uid: string; uploadUrl: string }> | RecipeFailure> {
  const parsed = videoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: typeof input?.fileSize === "number" && input.fileSize > MAX_POST_BYTES ? "file_too_large" : "invalid_input" };
  const { contentId, fileSize, fileName, durationSec } = parsed.data;
  if (durationSec !== null && durationSec > SERVER_MAX_POST_SECONDS) return { ok: false, error: "too_long" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, contentId);
  if ("ok" in own) return own;
  if (own.status !== "draft" || own.review_status === "in_review") return { ok: false, error: "content_not_editable" };
  if (!(await readVideoUploadConfigured(ctx.supabase))) return { ok: false, error: "video_not_configured" };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await ctx.supabase.from("stream_uploads").select("uid", { count: "exact", head: true }).eq("creator_id", ctx.creatorId).gte("created_at", since);
  if (countError) return recipeFail(countError);
  if ((count ?? 0) >= UPLOADS_PER_HOUR) return { ok: false, error: "too_many_uploads" };

  let ticket;
  try {
    ticket = await getStreamProvider().createUploadUrl({ creatorId: ctx.creatorId, maxDurationSec: MAX_POST_SECONDS, premium: false, fileSize, fileName });
  } catch (error) {
    return providerFailure(error, "upload");
  }
  const uid = ticket.mediaRef.id;
  const admin = createAdminClient();
  const { error: linkError } = await admin.from("stream_uploads").insert({ uid, creator_id: ctx.creatorId, content_id: contentId, expires_at: ticket.expiresAt });
  if (linkError) {
    try {
      await getStreamProvider().deleteVideo(uid);
    } catch {
      // sem vínculo o vídeo não serve; se o Cloudflare falhar agora, fica para o admin
    }
    return { ok: false, error: rpcErrorCode(linkError.message) === "too_many_uploads" ? "too_many_uploads" : "upload_failed" };
  }
  return { ok: true, uid, uploadUrl: ticket.uploadUrl };
}

/** O vídeo enviado já está pronto no Cloudflare? (o editor mostra o estado antes de publicar) */
export async function checkRecipeVideo(input: { contentId: string }): Promise<Ok<{ durationSec: number | null }> | RecipeFailure> {
  const parsed = z.object({ contentId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, parsed.data.contentId);
  if ("ok" in own) return own;
  const { data: body } = await ctx.supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", own.id).maybeSingle();
  if (body?.media_provider !== "cloudflare_stream") return { ok: false, error: "missing_media" };
  return checkStreamVideo(body.media_ref, ctx.creatorId);
}

// ---------------------------------------------------------------- publicar, agendar, revisão

/** Publica agora ou agenda (revisão desligada). O checklist do banco decide (recipe_incomplete). */
export async function publishRecipe(input: { id: string; publishAt?: string | null }): Promise<Ok<{ slug: string; scheduled: boolean }> | RecipeFailure> {
  const parsed = z.object({ id: idSchema, publishAt: z.string().trim().max(40).nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const schedule = parsePublishAt(parsed.data.publishAt);
  if (!schedule.ok) return { ok: false, error: "invalid_publish_at" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, parsed.data.id);
  if ("ok" in own) return own;
  if (own.status !== "draft") return { ok: false, error: "not_draft" };

  // vídeo enviado pelo celular só vai ao ar pronto no Cloudflare (mesma regra do composer)
  const { data: body } = await ctx.supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", own.id).maybeSingle();
  if (body?.media_provider === "cloudflare_stream") {
    if (!(await readVideoUploadConfigured(ctx.supabase))) return { ok: false, error: "video_not_configured" };
    const video = await checkStreamVideo(body.media_ref, ctx.creatorId);
    if (!video.ok) return video;
  }
  // slug definitivo pelo título final enquanto a receita nunca foi ao ar
  if (own.published_at === null && own.title.trim()) {
    const slugFailure = await setDraftSlug(ctx, own.id, own.title);
    if (slugFailure) return recipeFail(slugFailure.error);
  }
  const { data, error } = schedule.value
    ? await ctx.supabase.rpc("creator_publish_content", { p_content: own.id, p_publish_at: schedule.value })
    : await ctx.supabase.rpc("creator_publish_content", { p_content: own.id });
  if (error) return recipeFail(error);
  const slug = (data as { slug?: string } | null)?.slug ?? own.slug;
  revalidateRecipe(own.id);
  revalidatePublic(slug);
  return { ok: true, slug, scheduled: Boolean(schedule.value) };
}

/** Revisão ligada para receitas: envia com data sugerida opcional (o admin confirma ao aprovar). */
export async function submitRecipe(input: { id: string; requestedPublishAt?: string | null }): Promise<Ok | RecipeFailure> {
  const parsed = z.object({ id: idSchema, requestedPublishAt: z.string().trim().max(40).nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const schedule = parsePublishAt(parsed.data.requestedPublishAt);
  if (!schedule.ok) return { ok: false, error: "invalid_publish_at" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, parsed.data.id);
  if ("ok" in own) return own;
  const { error } = schedule.value
    ? await ctx.supabase.rpc("submit_content_for_review", { p_content: own.id, p_requested_publish_at: schedule.value })
    : await ctx.supabase.rpc("submit_content_for_review", { p_content: own.id });
  if (error) return recipeFail(error);
  revalidateRecipe(own.id);
  return { ok: true };
}

async function simpleRpc(fn: "creator_withdraw_review" | "creator_unpublish_content" | "creator_restore_content", id: string): Promise<Ok | RecipeFailure> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, id);
  if ("ok" in own) return own;
  const { error } = await ctx.supabase.rpc(fn, { p_content: id });
  if (error) return recipeFail(error);
  revalidateRecipe(id);
  if (fn === "creator_unpublish_content") revalidatePublic(own.slug);
  return { ok: true };
}

export async function withdrawRecipe(input: { id: string }): Promise<Ok | RecipeFailure> {
  return simpleRpc("creator_withdraw_review", input?.id);
}

/** Volta a rascunho editável; publicar de novo passa pelo checklist. */
export async function unpublishRecipe(input: { id: string }): Promise<Ok | RecipeFailure> {
  return simpleRpc("creator_unpublish_content", input?.id);
}

/** Só o que o próprio herói arquivou (o que o admin arquivou é trava dele). */
export async function restoreRecipe(input: { id: string }): Promise<Ok | RecipeFailure> {
  return simpleRpc("creator_restore_content", input?.id);
}

export async function archiveRecipe(input: { id: string; reason?: string }): Promise<Ok | RecipeFailure> {
  const parsed = z.object({ id: idSchema, reason: z.string().trim().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, parsed.data.id);
  if ("ok" in own) return own;
  const { error } = await ctx.supabase.rpc("creator_archive_content", { p_content: own.id, p_reason: parsed.data.reason ?? "" });
  if (error) return recipeFail(error);
  revalidateRecipe(own.id);
  revalidatePublic(own.slug);
  return { ok: true };
}

// ---------------------------------------------------------------- duplicar, excluir, versões

/** Cópia como rascunho novo (sem fotos, vídeo nem versões). Slug em uso tenta outro sufixo. */
export async function duplicateRecipe(input: { id: string }): Promise<Ok<{ id: string }> | RecipeFailure> {
  if (!idSchema.safeParse(input?.id).success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, input.id);
  if ("ok" in own) return own;
  const t = await getTranslations("recipes.portal");
  const title = t("copyTitle", { title: own.title }).slice(0, 140);
  let lastError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await ctx.supabase.rpc("creator_duplicate_recipe", { p_content: own.id, p_title: title, p_slug: uniqueSlug(title) });
    if (!error && typeof data === "string") {
      revalidateRecipe(data);
      return { ok: true, id: data };
    }
    lastError = error;
    if (rpcErrorCode(error?.message) !== "slug_taken") break;
  }
  return recipeFail(lastError);
}

/**
 * Exclui rascunho que nunca foi ao ar. A RPC devolve os caminhos das fotos (apagados aqui com a
 * sessão do herói: sem linha em recipe_media a política de exclusão libera) e o uid do Stream.
 */
export async function deleteRecipeDraft(input: { id: string }): Promise<Ok | RecipeFailure> {
  if (!idSchema.safeParse(input?.id).success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const own = await loadOwnRecipe(ctx, input.id);
  if ("ok" in own) return own;
  const { data, error } = await ctx.supabase.rpc("creator_delete_recipe_draft", { p_content: own.id });
  if (error) return recipeFail(error);
  const result = (data ?? {}) as { paths?: string[]; uid?: string | null };
  const paths = (result.paths ?? []).filter((p) => typeof p === "string");
  if (paths.length > 0) {
    const { error: removeError } = await ctx.supabase.storage.from(RECIPE_MEDIA_BUCKET).remove(paths);
    if (removeError) console.warn("[recipes] fotos ficam para a limpeza de órfãos", removeError.message);
  }
  if (result.uid) {
    try {
      await getStreamProvider().deleteVideo(result.uid);
      const admin = createAdminClient();
      await admin.from("stream_uploads").update({ provider_deleted_at: new Date().toISOString() }).eq("uid", result.uid);
    } catch {
      // envio já marcado como descartado: a limpeza diária apaga no Cloudflare
    }
  }
  revalidateRecipe();
  return { ok: true };
}

/** Restaura uma versão no rascunho (a nutrição volta sem validação; mídia só se ainda existe). */
export async function restoreRecipeVersion(input: { versionId: string; contentId: string }): Promise<Ok<{ updatedAt: string | null }> | RecipeFailure> {
  const parsed = z.object({ versionId: idSchema, contentId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { data, error } = await ctx.supabase.rpc("creator_restore_recipe_version", { p_version: parsed.data.versionId });
  if (error) return recipeFail(error);
  revalidateRecipe(parsed.data.contentId);
  return { ok: true, updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? null };
}
