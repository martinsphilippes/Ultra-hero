import "server-only";
import type { ShopTileData } from "@/lib/shop/queries";
import { ShopTile } from "./ShopTile";

// Quadros renderizados no servidor para a ação "carregar mais" (o cliente só anexa os nós).
export function renderShopTiles(items: ShopTileData[], batch: number) {
  return (
    <>
      {items.map((item) => (
        <ShopTile key={item.id} product={item} batch={batch} />
      ))}
    </>
  );
}
