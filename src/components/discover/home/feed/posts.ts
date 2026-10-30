import { CONTENT_TILE_SELECT, type ContentTileData } from "@/components/discover/explore/tiles";
import type { SmartTagView } from "@/lib/brands";

// Feed do Início (estilo Instagram): helpers puros, usados no servidor e nos testes.

/** Posts por carga: 10 é cerca de 6 telas de celular com a capa 4:5 de borda a borda. */
export const FEED_PAGE_SIZE = 10;

/** smart_tags: produtos marcados na foto (0062); ausente = sem marcações. */
export type FeedPostData = ContentTileData & { summary: string | null; creator_id: string | null; smart_tags?: SmartTagView[] };

// Mesmo recorte do quadro do Explorar, mais o resumo (legenda do post) e o id do herói (botão Seguir).
export const FEED_POST_SELECT = `${CONTENT_TILE_SELECT}, summary, creator_id`;
