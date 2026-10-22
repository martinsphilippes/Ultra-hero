import { Suspense } from "react";
import { getUser } from "@/lib/auth/session";
import { recordRecipeView } from "@/lib/recipes/history";
import { hasRecipeDetails } from "@/lib/recipes/rows";
import { createClient } from "@/lib/supabase/server";
import { cookModeHref } from "@/lib/recipes/cook-mode";
import { CookModeLink, CookModeLinkView } from "./CookModeLink";

type Props = { contentId: string; slug: string };

// Entrada da fase 4 na página da receita (uma linha em /content/[slug]): o botão do Modo Cozinha e o
// registro do último acesso no histórico, só para quem ligou o histórico na coleção. A página só
// renderiza isto quando a pessoa pode abrir a receita (fez a etapa e tem acesso).
export async function RecipeKitchenEntry({ contentId, slug }: Props) {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const [structured] = await Promise.all([
    hasRecipeDetails(supabase, contentId),
    // o histórico nunca derruba a página
    recordRecipeView(supabase, user.id, contentId).catch(() => "unavailable" as const),
  ]);
  if (!structured) return null;
  return (
    // useSearchParams (porções da URL) pede um limite de Suspense; sem ele o link vai sem o ajuste
    <Suspense fallback={<CookModeLinkView href={cookModeHref(slug, null)} />}>
      <CookModeLink slug={slug} />
    </Suspense>
  );
}
