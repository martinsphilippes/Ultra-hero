import type { ListEntry } from "@/lib/library/list-items";
import { ContentCard } from "./ContentCard";
import { ProductCard } from "./ProductCard";
import { ProgramCard } from "./ProgramCard";

type Props = { item: ListEntry; priority?: boolean; className?: string };

// Item de lista ou de favoritos: cada tipo com o card que o app já usa no catálogo, na loja e nas prateleiras.
export function EntryCard({ item, priority, className }: Props) {
  if (item.kind === "product") return <ProductCard product={item.product} priority={priority} className={className} />;
  if (item.kind === "program") return <ProgramCard program={item.program} priority={priority} className={className} />;
  return <ContentCard content={item.content} priority={priority} className={className} />;
}
