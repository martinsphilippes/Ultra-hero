// Validação de referência de mídia no formulário (ID ou URL de YouTube/Vimeo).
// Usa os MESMOS parsers da reprodução (src/lib/video/providers/embed, módulo sem "server-only"):
// o ID gravado em media_ref é exatamente o que o player aceitaria. Uma cópia local divergiu antes —
// URL de showcase/álbum do Vimeo gravava o ID do contêiner, que depois passava na reprodução como
// "ID puro" e tocava o vídeo errado.
import { parseVimeoId, parseYouTubeId } from "@/lib/video/providers/embed";

export { parseVimeoId, parseYouTubeId };

export function parseMediaRef(provider: string, raw: string): string | null {
  if (provider === "embed_youtube") return parseYouTubeId(raw);
  if (provider === "embed_vimeo") return parseVimeoId(raw);
  return null;
}
