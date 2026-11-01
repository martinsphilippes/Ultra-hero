import { CONTENT_TILE_SELECT, type ContentTileData } from "@/components/discover/explore/tiles";
import type { SmartTagView } from "@/lib/brands";

// Feed do Início (estilo Instagram): helpers puros, usados no servidor e nos testes.

/** Posts por carga: 10 é cerca de 6 telas de celular com a capa 4:5 de borda a borda. */
export const FEED_PAGE_SIZE = 10;

/**
 * smart_tags: produtos marcados na foto (0062); ausente = sem marcações. body: provedor da mídia do
 * corpo (content_bodies, 1:1), que separa o post com foto do composer (0043) do artigo com capa
 * enviada pelo editor; null para quem não lê o corpo (visitante: a RLS esconde) → vale a capa.
 */
export type FeedPostData = ContentTileData & { summary: string | null; creator_id: string | null; smart_tags?: SmartTagView[]; body?: { media_provider: string } | null };

// Mesmo recorte do quadro do Explorar, mais o resumo (legenda do post), o id do herói (botão Seguir) e o
// provedor do corpo (rótulo Foto × Artigo).
export const FEED_POST_SELECT = `${CONTENT_TILE_SELECT}, summary, creator_id, body:content_bodies(media_provider)`;

/** Entrada de isPhotoPost a partir do post do feed: sem corpo lido, o provedor fica desconhecido. */
export function feedPostKind(post: Pick<FeedPostData, "type" | "cover_url" | "body">): { type: string; cover_url: string | null; media_provider?: string } {
  return post.body ? { type: post.type, cover_url: post.cover_url, media_provider: post.body.media_provider } : { type: post.type, cover_url: post.cover_url };
}
