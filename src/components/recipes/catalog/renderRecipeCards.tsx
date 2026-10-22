import "server-only";
import type { RecipeCardData } from "@/lib/recipes/card";
import { RecipeCard } from "./RecipeCard";

// Renderiza cards no servidor para a ação "carregar mais" (o cliente só anexa os nós à grade).
export function renderRecipeCards(items: RecipeCardData[]) {
  return (
    <>
      {items.map((item) => (
        <li key={item.id}>
          <RecipeCard recipe={item} />
        </li>
      ))}
    </>
  );
}
