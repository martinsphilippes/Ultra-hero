import { getUser } from "@/lib/auth/session";
import { recordRecipeView } from "@/lib/recipes/history";
import { createClient } from "@/lib/supabase/server";

type Props = { contentId: string };

// Registro do último acesso no histórico de receitas vistas (fase 4), só para quem ligou o histórico
// na coleção. A página só renderiza isto quando a pessoa pode abrir a receita (fez a etapa e tem
// acesso). Não desenha nada: o botão do Modo Cozinha fica na linha de ações da página.
export async function RecipeKitchenEntry({ contentId }: Props) {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  // o histórico nunca derruba a página
  await recordRecipeView(supabase, user.id, contentId).catch(() => "unavailable" as const);
  return null;
}
