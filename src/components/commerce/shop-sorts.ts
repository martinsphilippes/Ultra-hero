// Ordenações da loja (módulo sem "use client" para poder ser importado por Server Components).
export type ShopSort = "newest" | "priceAsc" | "priceDesc" | "title";
export const SHOP_SORTS: ShopSort[] = ["newest", "priceAsc", "priceDesc", "title"];
