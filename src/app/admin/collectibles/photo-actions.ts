"use server";

import { z } from "zod";
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
import { createClient } from "@/lib/supabase/server";

// Foto do colecionável tirada na hora ou escolhida no celular (0074): os bytes passam pelo servidor,
// que confere tipo e dimensões pelos magic bytes, reserva o envio pelo admin
// (collectible_photo_upload_claim: kill switch e cota da foto do post) e grava no bucket público
// post-photos com o service role. A URL só entra em collectibles.photos quando o formulário é salvo;
// sem uso em 1 h, a limpeza diária apaga.

export type CollectiblePhotoError =
  | "unauthenticated"
  | "forbidden"
  | "not_image"
  | "empty_file"
  | "file_too_large"
  | "invalid_dimensions"
  | "uploads_disabled"
  | "too_many_uploads"
  | "upload_failed"
  | "photo_not_configured"
  | "upload_rights_required"
  | "generic";

export type CollectiblePhotoResult = { ok: true; url: string } | { ok: false; error: CollectiblePhotoError };

const KNOWN: ReadonlySet<string> = new Set<CollectiblePhotoError>(["not_image", "empty_file", "file_too_large", "uploads_disabled", "too_many_uploads", "forbidden"]);

const fileSchema = z
  .instanceof(Blob)
  .refine((f) => f.size > 0, "empty_file")
  .refine((f) => f.size <= POST_PHOTO_MAX_UPLOAD_BYTES, "file_too_large");

// Banco ainda sem a 0074 (função ausente no PostgREST) = recurso não configurado.
function rpcFailure(error: { code?: string; message?: string } | null): CollectiblePhotoError {
  if (!error) return "generic";
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") return "photo_not_configured";
  const code = rpcErrorCode(error.message);
  if (KNOWN.has(code)) return code as CollectiblePhotoError;
  return error.code === "42501" ? "forbidden" : "generic";
}

export async function uploadCollectiblePhoto(formData: FormData): Promise<CollectiblePhotoResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!(await hasRole("admin"))) return { ok: false, error: "forbidden" };
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

  try {
    const supabase = await createClient();
    // Termos do Parceiro (0068): quem envia confirma os direitos sobre a foto antes do primeiro envio
    if (!(await hasUploadRights(supabase, user.id))) return { ok: false, error: UPLOAD_RIGHTS_REQUIRED };
    const { data: path, error: claimError } = await supabase.rpc("collectible_photo_upload_claim", { p_bytes: bytes.length, p_mime: check.image.mime });
    if (claimError || typeof path !== "string") return { ok: false, error: rpcFailure(claimError) };
    // o caminho reservado começa pelo id de quem enviou; qualquer outra coisa é erro do banco
    if (!path.startsWith(`${user.id}/`) || !isPostPhotoPath(path)) return { ok: false, error: "generic" };

    try {
      await storePostPhoto(createAdminClient(), { path, bytes, mime: check.image.mime });
    } catch (error) {
      console.warn("[collectible-photo] envio ao Storage falhou:", error instanceof Error ? error.message : error);
      // não marca como apagado: o objeto pode ter chegado; sem uso, a limpeza diária apaga em 1 h
      return { ok: false, error: "upload_failed" };
    }
    return { ok: true, url: publicPostPhotoUrl(base, path) };
  } catch (error) {
    console.warn("[collectible-photo] envio falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}
