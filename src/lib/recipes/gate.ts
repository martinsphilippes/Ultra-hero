import "server-only";
import { cache } from "react";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_GATE, pickKnown, RECIPE_ALLERGIES, RECIPE_RESTRICTIONS, type RecipeGateState } from "./onboarding";

// Situação da etapa demonstrativa para a pessoa atual (visitante = fechada). Memoizado por request.
export const getRecipeGate = cache(async (): Promise<RecipeGateState> => {
  const user = await getUser();
  if (!user) return CLOSED_GATE;
  const supabase = await createClient();
  const { data } = await supabase.from("recipe_onboarding").select("restrictions, allergies, completed_at").eq("user_id", user.id).maybeSingle();
  if (!data) return { ...CLOSED_GATE, loggedIn: true };
  return {
    loggedIn: true,
    completed: Boolean(data.completed_at),
    restrictions: pickKnown(data.restrictions, RECIPE_RESTRICTIONS),
    allergies: pickKnown(data.allergies, RECIPE_ALLERGIES),
  };
});
