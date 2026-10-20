import "server-only";
import { ContentCard } from "@/components/catalog";
import type { ContentCardData } from "@/lib/catalog/queries";

// Renderiza cards no servidor para a ação "carregar mais" (o cliente só anexa os nós).
export function renderContentCards(items: ContentCardData[]) {
  return (
    <>
      {items.map((item) => (
        <ContentCard key={item.id} content={item} />
      ))}
    </>
  );
}
