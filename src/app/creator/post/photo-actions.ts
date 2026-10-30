"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { CAPTION_MAX, TITLE_MAX } from "@/components/creator/post/validation";
import { LOCALE_VALUES, PILLAR_VALUES } from "@/components/editors/content/schema";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { POST_PHOTO_MAX_UPLOAD_BYTES } from "@/lib/post-photo/constants";
import { isPostPhotoPath, publicPostPhotoUrl } from "@/lib/post-photo/paths";
import { removePostPhoto, storePostPhoto } from "@/lib/post-photo/server";
import { validatePostPhotoBytes } from "@/lib/post-photo/validation";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { LocaleCode, Pillar } from "@/lib/supabase/helpers";
import { failFrom, type ActionFailure } from "../_lib/action-utils";
import { insertCreatorContent } from "../_lib/content-insert";
import { creatorActionContext } from "../_lib/creator-action";
import { setDraftSlug } from "../_lib/draft-slug";

// Post com foto (0043). Os bytes passam pelo servidor: tipo e dimensões conferidos pelos magic
// bytes, envio reservado no banco (herói ativo, cota, kill switch), objeto gravado no bucket público
// com o service role e rascunho criado com a foto na capa e no corpo. O banco recusa foto que não
// foi reservada pelo próprio herói (gatilhos da 0043). O cliente só conhece o contentId.

type StartResult = { ok: true; contentId: string } | ActionFailure;
type PublishResult = { ok: true; slug: string } | ActionFailure;
type DiscardResult = { ok: true; deleted: boolean } | ActionFailure;

const fileSchema = z
  .instanceof(Blob)
  .refine((f) => f.size > 0, "empty_file")
  .refine((f) => f.size <= POST_PHOTO_MAX_UPLOAD_BYTES, "file_too_large");

const publishSchema = z.object({
  contentId: z.uuid(),
  title: z.string().trim().min(1).max(TITLE_MAX),
  caption: z.string().trim().max(CAPTION_MAX).optional().default(""),
  pillar: z.enum(PILLAR_VALUES),
});

const idSchema = z.object({ contentId: z.uuid() });

// Banco ainda sem a 0043 (função ou tabela ausente no PostgREST) = recurso não configurado.
function rpcFailure(error: { code?: string; message?: string } | null): ActionFailure {
  if (error && (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01")) {
    return { ok: false, error: "photo_not_configured" };
  }
  return failFrom(error);
}

function revalidatePost() {
  revalidatePath("/creator");
  revalidatePath("/creator/content");
}

export async function startPhotoPost(formData: FormData): Promise<StartResult> {
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { supabase, creatorId, userId } = ctx;
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "photo_not_configured" };

  const parsed = fileSchema.safeParse(formData.get("file"));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { ok: false, error: code === "empty_file" || code === "file_too_large" ? code : "not_image" };
  }
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  const check = validatePostPhotoBytes(bytes);
  if (!check.ok) return { ok: false, error: check.error };

  const { data: path, error: claimError } = await supabase.rpc("post_photo_upload_claim", { p_bytes: bytes.length, p_mime: check.image.mime });
  if (claimError || typeof path !== "string") return rpcFailure(claimError);
  // o caminho reservado começa pelo id de quem enviou; qualquer outra coisa é erro do banco
  if (!path.startsWith(`${userId}/`) || !isPostPhotoPath(path)) return { ok: false, error: "generic" };

  const admin = createAdminClient();
  try {
    await storePostPhoto(admin, { path, bytes, mime: check.image.mime });
  } catch (error) {
    console.warn("[post-photo] envio ao Storage falhou:", error instanceof Error ? error.message : error);
    // não marca como apagado: o objeto pode ter chegado; sem uso, a limpeza diária apaga em 1 h
    return { ok: false, error: "upload_failed" };
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
    title: t("photo.draftTitle"),
    summary: null,
    type: "article",
    pillar,
    source_locale: sourceLocale,
    cover_url: publicPostPhotoUrl(base, path),
    duration_minutes: null,
    tags: [],
    has_captions: false,
    media_license_kind: "own",
  });
  if (!inserted.ok) {
    await removePostPhoto(admin, path);
    return inserted;
  }

  // Corpo com o cliente do usuário: o gatilho da 0043 confere que a foto é do próprio herói.
  const { error: bodyError } = await supabase.from("content_bodies").insert({
    content_id: inserted.id,
    body: { kind: "article", format: "photo", intro: "", sections: [], key_points: [] } as unknown as NonNullable<Json>,
    media_provider: "upload",
    media_ref: path,
    captions_url: null,
  });
  if (bodyError) {
    await admin.from("content").delete().eq("id", inserted.id).eq("status", "draft");
    await removePostPhoto(admin, path);
    return failFrom(bodyError);
  }

  revalidatePost();
  return { ok: true, contentId: inserted.id };
}

export async function publishPhotoPost(input: { contentId: string; title: string; caption?: string; pillar: Pillar }): Promise<PublishResult> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "title") ? "missing_title" : "invalid_input" };
  const { contentId, title, caption, pillar } = parsed.data;

  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { supabase, creatorId } = ctx;

  const { data: content } = await supabase.from("content").select("id, slug, status, creator_id, published_at").eq("id", contentId).maybeSingle();
  // A RLS já esconde conteúdo de outros heróis; a comparação é a defesa extra (e não revela ids).
  if (!content || content.creator_id !== creatorId) return { ok: false, error: "forbidden" };
  // Segundo toque depois de publicar (rede lenta): devolve o mesmo resultado.
  if (content.status === "published") return { ok: true, slug: content.slug };
  if (content.status !== "draft") return { ok: false, error: "not_draft" };

  const { data: body } = await supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", contentId).maybeSingle();
  if (!body || body.media_provider !== "upload" || !isPostPhotoPath(body.media_ref)) return { ok: false, error: "missing_media" };

  const { error: updateError } = await supabase.from("content").update({ title, summary: caption || null, pillar }).eq("id", contentId);
  if (updateError) return failFrom(updateError);

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
  return { ok: true, slug };
}

export async function discardPhotoPost(input: { contentId: string }): Promise<DiscardResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;

  // A RPC confere dono, rascunho nunca publicado e corpo com foto; apaga o conteúdo e devolve o
  // caminho da foto quando ninguém mais a usa. O objeto sai em seguida (melhor esforço).
  const { data, error } = await ctx.supabase.rpc("creator_discard_photo_draft", { p_content: parsed.data.contentId });
  if (error) return rpcFailure(error);
  revalidatePost();

  const path = (data as { path?: string | null } | null)?.path;
  if (path && isPostPhotoPath(path) && path.startsWith(`${ctx.userId}/`) && hasAdminClient()) {
    try {
      const removed = await removePostPhoto(createAdminClient(), path);
      if (!removed) console.warn("[post-photo] objeto não apagado agora; a limpeza diária termina");
    } catch (cleanupError) {
      console.warn("[post-photo] falha ao apagar a foto:", cleanupError instanceof Error ? cleanupError.message : cleanupError);
    }
  }
  return { ok: true, deleted: true };
}
