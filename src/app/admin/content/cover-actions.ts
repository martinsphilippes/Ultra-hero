"use server";

import { z } from "zod";
import { actingClient } from "@/lib/acting-hero/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { POST_PHOTO_MAX_UPLOAD_BYTES } from "@/lib/post-photo/constants";
import { isPostPhotoPath, publicPostPhotoUrl } from "@/lib/post-photo/paths";
import { storePostPhoto } from "@/lib/post-photo/server";
import { validatePostPhotoBytes } from "@/lib/post-photo/validation";
import { hasUploadRights } from "@/lib/partner-terms/server";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { rpcErrorCode } from "@/lib/supabase/helpers";

// Capa do conteúdo no editor do admin: foto tirada na hora ou escolhida no celular (de um vídeo, o
// navegador tira um quadro). Mesmo desenho de segurança da foto do post (0043): os bytes passam pelo
// servidor, que confere tipo e dimensões pelos magic bytes, reserva o envio no banco pelo herói
// escolhido (post_photo_upload_claim honra o admin agindo por um herói ativo: 0045; kill switch e
// cota valem), grava no bucket público post-photos com o service role e devolve a URL pública. A URL
// só entra em content.cover_url quando o formulário é salvo; sem uso em 1 h, a limpeza diária apaga.

export type ContentCoverError =
  | "unauthenticated"
  | "forbidden"
  | "creator_required"
  | "not_image"
  | "empty_file"
  | "file_too_large"
  | "invalid_dimensions"
  | "uploads_disabled"
  | "too_many_uploads"
  | "not_a_hero"
  | "upload_failed"
  | "photo_not_configured"
  | "upload_rights_required"
  | "generic";

export type ContentCoverResult = { ok: true; coverUrl: string } | { ok: false; error: ContentCoverError };

const KNOWN: ReadonlySet<string> = new Set<ContentCoverError>(["not_image", "empty_file", "file_too_large", "uploads_disabled", "too_many_uploads", "not_a_hero"]);

const inputSchema = z.object({
  creatorId: z.uuid(),
  file: z
    .instanceof(Blob)
    .refine((f) => f.size > 0, "empty_file")
    .refine((f) => f.size <= POST_PHOTO_MAX_UPLOAD_BYTES, "file_too_large"),
});

// Banco ainda sem a 0043/0045 (função ausente no PostgREST) = recurso não configurado.
function rpcFailure(error: { code?: string; message?: string } | null): ContentCoverError {
  if (!error) return "generic";
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") return "photo_not_configured";
  const code = rpcErrorCode(error.message);
  if (KNOWN.has(code)) return code as ContentCoverError;
  // sem permissão no banco (herói escolhido inativo, cabeçalho não honrado): a tela pede outro herói
  return error.code === "42501" ? "not_a_hero" : "generic";
}

export async function uploadContentCover(formData: FormData): Promise<ContentCoverResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  // o editor de conteúdo é do admin (0045): o herói em nome de quem a capa é reservada vem do seletor
  if (!(await hasRole("admin"))) return { ok: false, error: "forbidden" };
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "photo_not_configured" };

  const rawCreator = formData.get("creatorId");
  if (typeof rawCreator !== "string" || rawCreator === "") return { ok: false, error: "creator_required" };
  const parsed = inputSchema.safeParse({ creatorId: rawCreator, file: formData.get("file") });
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    if (code === "empty_file" || code === "file_too_large") return { ok: false, error: code };
    return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "creatorId") ? "creator_required" : "not_image" };
  }
  const bytes = new Uint8Array(await parsed.data.file.arrayBuffer());
  const check = validatePostPhotoBytes(bytes);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    // cabeçalho x-acting-hero: o banco só o honra para o admin com herói ativo (acting_hero_id, 0045).
    // Confere antes de reservar: um admin que também é herói passaria na reserva pelo próprio perfil, e
    // a capa ficaria reservada "por ninguém" para um herói inativo ou inexistente.
    const supabase = await actingClient(parsed.data.creatorId);
    const { data: acting, error: actingError } = await supabase.rpc("acting_hero_id");
    if (actingError) return { ok: false, error: rpcFailure(actingError) };
    if (acting !== parsed.data.creatorId) return { ok: false, error: "not_a_hero" };
    // Termos do Parceiro (0068): quem envia confirma os direitos sobre a foto antes do primeiro envio
    if (!(await hasUploadRights(supabase, user.id))) return { ok: false, error: UPLOAD_RIGHTS_REQUIRED };
    const { data: path, error: claimError } = await supabase.rpc("post_photo_upload_claim", { p_bytes: bytes.length, p_mime: check.image.mime });
    if (claimError || typeof path !== "string") return { ok: false, error: rpcFailure(claimError) };
    // o caminho reservado começa pelo id de quem enviou; qualquer outra coisa é erro do banco
    if (!path.startsWith(`${user.id}/`) || !isPostPhotoPath(path)) return { ok: false, error: "generic" };

    try {
      await storePostPhoto(createAdminClient(), { path, bytes, mime: check.image.mime });
    } catch (error) {
      console.warn("[content-cover] envio ao Storage falhou:", error instanceof Error ? error.message : error);
      // não marca como apagado: o objeto pode ter chegado; sem uso, a limpeza diária apaga em 1 h
      return { ok: false, error: "upload_failed" };
    }
    return { ok: true, coverUrl: publicPostPhotoUrl(base, path) };
  } catch (error) {
    console.warn("[content-cover] envio falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}
