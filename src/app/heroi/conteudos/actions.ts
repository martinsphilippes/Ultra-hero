"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseContentForm, stripNutritionValidation } from "@/components/editors/content/schema";
import type { ActionResult, ContentFormValues } from "@/components/editors/types";
import type { Json } from "@/lib/supabase/database.types";
import { failFrom } from "../_lib/action-utils";
import { insertCreatorContent, type CreatorSupabase } from "../_lib/content-insert";
import { creatorActionContext } from "../_lib/creator-action";
import { setDraftSlug } from "../_lib/draft-slug";
import { checkStreamVideo, readVideoUploadConfigured } from "../_lib/video-post";
import { schedulePushDispatch } from "@/lib/push/schedule";
import { creatorLicenseKind } from "@/lib/creator-content/rules";
import { isMissingSchema } from "@/lib/supabase/helpers";

// Ações sobre conteúdo do Hero (Novo conteúdo e Meus conteúdos). 0092: o creator (titular ou membro da equipe)
// pelo Hero dele, ou o admin pelo Hero escolhido (creatorActionContext "content"). Rascunhos e publicar/despublicar
// pelas RPCs da 0025; "Enviar para revisão" quando o admin exige revisão do tipo; tirar do ar e arquivar o que já
// esteve no ar só o titular (o banco responde owner_only ao membro).

type SaveResult = ActionResult & { id?: string };
type Supabase = CreatorSupabase;

// Colunas que a personalidade pode escrever (espelha trg_a_content_guard). O creator não vê os campos de
// licença (só do admin): a licença é a do conteúdo próprio e a referência/crédito ficam vazios.
function creatorColumns(v: ContentFormValues, acting: boolean) {
  const license = acting
    ? { media_license_kind: v.media_license_kind, media_license_ref: v.media_license_ref || null, media_credit: v.media_credit || null }
    : { media_license_kind: creatorLicenseKind(v.media.provider), media_license_ref: null, media_credit: null };
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
    ...license,
  };
}

// Blocos (0075/0076) pela RPC post_block_set (o banco confere dono, forma e referências) e produtos: o creator só
// sugere o vínculo (status 'suggested'; o admin valida em Vínculos, como no fluxo antigo). Sugestão que saiu da
// lista é apagada; vínculo já validado só o admin tira. Banco sem a 0075: blocos ignorados em silêncio.
async function saveBlocks(supabase: Supabase, creatorId: string, userId: string, contentId: string, blocks: NonNullable<ContentFormValues["blocks"]>): Promise<string | null> {
  const pillar = blocks.pillar
    ? await supabase.rpc("post_block_set", { p_content: contentId, p_kind: blocks.pillar.kind, p_data: blocks.pillar.data })
    : await supabase.rpc("post_block_set", { p_content: contentId, p_kind: null, p_data: null });
  if (pillar.error) return isMissingSchema(pillar.error) ? null : failFrom(pillar.error).error;
  const program = await supabase.rpc("post_block_set", { p_content: contentId, p_kind: "program", p_data: blocks.program ? blocks.program.data : null });
  if (program.error) return failFrom(program.error).error;

  const { data: links, error } = await supabase.from("content_product_links").select("id, product_id, status").eq("content_id", contentId);
  if (error) return failFrom(error).error;
  const chosen = new Set(blocks.products);
  const existing = new Set((links ?? []).map((l) => l.product_id));
  const stale = (links ?? []).filter((l) => l.status === "suggested" && !chosen.has(l.product_id)).map((l) => l.id);
  if (stale.length > 0) {
    const { error: delError } = await supabase.from("content_product_links").delete().in("id", stale);
    if (delError) return failFrom(delError).error;
  }
  const fresh = blocks.products.filter((id) => !existing.has(id));
  if (fresh.length > 0) {
    const { error: insError } = await supabase
      .from("content_product_links")
      .insert(fresh.map((product_id) => ({ content_id: contentId, product_id, status: "suggested" as const, suggested_by: userId, suggested_by_creator: creatorId })));
    if (insError) return failFrom(insError).error;
  }
  return null;
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

// Receita fica só para leitura no editor antigo até o editor novo (fase 2): sem publicar nem
// despublicar por aqui, senão uma receita antiga sairia do ar sem como voltar.
async function isRecipe(supabase: Supabase, id: string): Promise<boolean> {
  const { data } = await supabase.from("content").select("type").eq("id", id).maybeSingle();
  return data?.type === "recipe";
}

function revalidateContent(id?: string) {
  revalidatePath("/heroi");
  revalidatePath("/heroi/conteudos");
  revalidatePath("/heroi/vinculos");
  if (id) revalidatePath(`/heroi/conteudos/${id}/editar`);
}

const idInput = z.object({ id: z.uuid() });

// Exigir revisão (0027, content_review_required): o creator envia o rascunho salvo; o admin aprova ou devolve.
export async function submitContentForReview(input: { id: string }): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  if (await isRecipe(ctx.supabase, parsed.data.id)) return { ok: false, error: "recipe_editor_pending" };
  const { error } = await ctx.supabase.rpc("submit_content_for_review", { p_content: parsed.data.id });
  if (error) return failFrom(error);
  revalidateContent(parsed.data.id);
  revalidatePath("/admin/content");
  return { ok: true };
}

// Retirar da revisão: volta a rascunho editável (creator_withdraw_review, 0027).
export async function withdrawContentReview(input: { id: string }): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.rpc("creator_withdraw_review", { p_content: parsed.data.id });
  if (error) return failFrom(error);
  revalidateContent(parsed.data.id);
  return { ok: true };
}

// Arquivar: rascunho que nunca foi ao ar qualquer um da equipe; o que já esteve no ar só o titular (owner_only).
export async function archiveContent(input: { id: string }): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  if (await isRecipe(ctx.supabase, parsed.data.id)) return { ok: false, error: "recipe_editor_pending" };
  const { error } = await ctx.supabase.rpc("creator_archive_content", { p_content: parsed.data.id, p_reason: "" });
  if (error) return failFrom(error);
  revalidateContent(parsed.data.id);
  revalidatePath("/inicio");
  revalidatePath("/explore");
  return { ok: true };
}

export async function createContent(values: ContentFormValues): Promise<SaveResult> {
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  // A personalidade nunca valida nutrição (RB-08): a marcação é zerada antes de validar e gravar.
  const parsed = parseContentForm(stripNutritionValidation(values));
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  // Receita estruturada (0027) só pelo editor novo: este formulário gravaria o corpo v1, que o banco recusa.
  if (v.type === "recipe") return { ok: false, error: "recipe_editor_pending" };

  // Vídeo do Cloudflare e foto do post só nascem pelo composer (/heroi/post/novo), que cria o
  // ticket/envio no servidor.
  if (v.media.provider === "cloudflare_stream" || v.media.provider === "upload") return { ok: false, error: "forbidden" };

  const { supabase, creatorId, userId } = ctx;
  const inserted = await insertCreatorContent(supabase, { creator_id: creatorId, created_by: userId, ...creatorColumns(v, ctx.actingFor !== null) });
  if (!inserted.ok) return inserted;
  const contentId = inserted.id;

  const bodyError = (await saveBody(supabase, contentId, v)) ?? (v.blocks ? await saveBlocks(supabase, creatorId, userId, contentId, v.blocks) : null);
  revalidateContent(contentId);
  if (bodyError) return { ok: false, error: bodyError, id: contentId };
  return { ok: true, id: contentId };
}

export async function updateContent(values: ContentFormValues): Promise<SaveResult> {
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  const parsed = parseContentForm(stripNutritionValidation(values));
  if (!parsed.ok || !parsed.data.id) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  const id = v.id as string;

  const { supabase } = ctx;
  const { data: existing } = await supabase.from("content").select("id, type, status, review_status, creator_id").eq("id", id).maybeSingle();
  if (!existing || existing.creator_id !== ctx.creatorId) return { ok: false, error: "not_found" };
  if (existing.type === "recipe" || v.type === "recipe") return { ok: false, error: "recipe_editor_pending" };
  // Mesma regra do guard do banco; evita gravar o corpo de algo em revisão.
  if (existing.status !== "draft" || existing.review_status === "in_review") return { ok: false, error: "content_not_editable" };
  // O uid do Cloudflare fica preso ao rascunho: o formulário pode manter o vídeo enviado, nunca trocar por outro uid.
  // Mesma regra para a foto do composer (0043): mantém a do rascunho, nunca troca por outra.
  if (v.media.provider === "cloudflare_stream" || v.media.provider === "upload") {
    const { data: current } = await supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", id).maybeSingle();
    if (current?.media_provider !== v.media.provider || current.media_ref !== v.media.ref) return { ok: false, error: "forbidden" };
  }

  const { error } = await supabase.from("content").update(creatorColumns(v, ctx.actingFor !== null)).eq("id", id);
  if (error) return failFrom(error);

  const bodyError = (await saveBody(supabase, id, v)) ?? (v.blocks ? await saveBlocks(supabase, ctx.creatorId, ctx.userId, id, v.blocks) : null);
  revalidateContent(id);
  if (bodyError) return { ok: false, error: bodyError, id };
  return { ok: true, id };
}

// O Hero publica direto (0025): o banco confere dono, título, corpo, mídia e licença.
export async function publishContent(input: { id: string }): Promise<ActionResult & { slug?: string }> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  const { supabase, creatorId } = ctx;
  const id = parsed.data.id;
  if (await isRecipe(supabase, id)) return { ok: false, error: "recipe_editor_pending" };

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
  revalidatePath("/inicio");
  revalidatePath("/explore");
  // no ar: avisa quem favoritou o Hero (fila enchida pelo banco, 0054)
  schedulePushDispatch();
  return { ok: true, slug: (data as { slug?: string } | null)?.slug };
}

// Despublicar volta o conteúdo a rascunho editável; publicar de novo usa a mesma checagem.
export async function unpublishContent(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext("content");
  if (!ctx.ok) return ctx;
  if (await isRecipe(ctx.supabase, parsed.data.id)) return { ok: false, error: "recipe_editor_pending" };
  const { error } = await ctx.supabase.rpc("creator_unpublish_content", { p_content: parsed.data.id });
  if (error) return failFrom(error);
  revalidateContent(parsed.data.id);
  revalidatePath("/inicio");
  revalidatePath("/explore");
  return { ok: true };
}
