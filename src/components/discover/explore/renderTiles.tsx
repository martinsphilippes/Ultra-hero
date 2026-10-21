import "server-only";
import { ContentTile } from "@/components/catalog";
import type { ContentTileData } from "./tiles";

// Renderiza quadros no servidor para a ação "carregar mais" (o cliente só anexa os nós).
export function renderContentTiles(items: ContentTileData[]) {
  return (
    <>
      {items.map((item) => (
        <ContentTile key={item.id} content={item} />
      ))}
    </>
  );
}
