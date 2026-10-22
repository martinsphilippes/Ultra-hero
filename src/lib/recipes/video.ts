// Vídeo opcional da receita por link (YouTube/Vimeo). Usa os MESMOS parsers da reprodução: o id
// gravado em media_ref é exatamente o que o player aceita. O envio pelo Cloudflare Stream não passa
// por aqui (o uid nasce no servidor, com o vínculo em stream_uploads).
import { parseVimeoId, parseYouTubeId } from "@/lib/video/providers/embed";

export type RecipeVideoLink = { provider: "embed_youtube" | "embed_vimeo"; ref: string };

export function parseRecipeVideoLink(raw: string): RecipeVideoLink | null {
  const value = raw.trim();
  if (!value) return null;
  const youtube = parseYouTubeId(value);
  if (youtube) return { provider: "embed_youtube", ref: youtube };
  const vimeo = parseVimeoId(value);
  if (vimeo) return { provider: "embed_vimeo", ref: vimeo };
  return null;
}

/** Link legível para mostrar no campo a partir do que está gravado. */
export function recipeVideoLinkText(provider: string, ref: string | null): string {
  if (!ref) return "";
  if (provider === "embed_youtube") return `https://youtu.be/${ref}`;
  if (provider === "embed_vimeo") return `https://vimeo.com/${ref}`;
  return "";
}

export type StreamUploadPhase = "idle" | "uploading" | "failed";

/**
 * O que a etapa Mídia mostra no modo "Enviar do aparelho". O uid entra no rascunho logo que o ticket
 * existe, mas o envio (tus) ainda corre no componente de envio: trocar para o painel "vídeo atual"
 * nessa hora desmontaria o envio (abortando-o) e sumiria com o progresso. O painel só aparece sem
 * envio em andamento; envio que falhou continua no componente, com o erro e o "Escolher vídeo".
 */
export function streamPanel(video: { provider: string; ref: string | null }, phase: StreamUploadPhase): "current" | "uploader" {
  return video.provider === "cloudflare_stream" && video.ref && phase === "idle" ? "current" : "uploader";
}
