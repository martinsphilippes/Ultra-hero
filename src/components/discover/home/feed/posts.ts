import { CONTENT_TILE_SELECT, type ContentTileData } from "@/components/discover/explore/tiles";

// Feed do Início (estilo Instagram): helpers puros, usados no servidor e nos testes.

/** Posts por carga: 10 é cerca de 6 telas de celular com a capa 4:5 de borda a borda. */
export const FEED_PAGE_SIZE = 10;

export type FeedPostData = ContentTileData & { summary: string | null; creator_id: string | null };

// Mesmo recorte do quadro do Explorar, mais o resumo (legenda do post) e o id do herói (botão Seguir).
export const FEED_POST_SELECT = `${CONTENT_TILE_SELECT}, summary, creator_id`;
