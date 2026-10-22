import { z } from "zod";
import { RECIPE_MEDIA_BUCKET, isLive, recipeMediaCacheControl, sniffImageMime } from "@/lib/recipes/media";
import { createClient } from "@/lib/supabase/server";

// Proxy das fotos de receita (bucket privado recipe-media, 0028). A visibilidade é decidida a cada
// requisição pela RLS de recipe_media com o cliente de quem pede: galeria de receita no ar para
// todos, foto de etapa só com acesso à receita, rascunho só para o herói dono e o admin. Nenhum
// código aqui usa a service role. Os bytes são conferidos contra o tipo gravado antes de servir.

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

type MediaRow = { id: string; content_id: string; role: "gallery" | "step"; storage_path: string; mime: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const supabase = await createClient();

  const { data, error } = await supabase.from("recipe_media").select("id, content_id, role, storage_path, mime").eq("id", id).maybeSingle();
  if (error || !data) return notFound();
  const media = data as MediaRow;

  const { data: blob, error: downloadError } = await supabase.storage.from(RECIPE_MEDIA_BUCKET).download(media.storage_path);
  if (downloadError || !blob) return notFound();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // o tipo servido é o do banco, e só quando os bytes batem (nada de HTML disfarçado de imagem)
  if (sniffImageMime(bytes.subarray(0, 16)) !== media.mime) return notFound();

  // galeria de receita no ar pode ir para o cache compartilhado; o resto nunca
  let isPublic = false;
  if (media.role === "gallery") {
    const { data: content } = await supabase.from("content").select("status, publish_at").eq("id", media.content_id).maybeSingle();
    isPublic = Boolean(content && isLive(content.status, content.publish_at));
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": media.mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": recipeMediaCacheControl(isPublic),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
