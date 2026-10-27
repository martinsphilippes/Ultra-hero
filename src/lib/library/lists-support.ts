import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ListTarget } from "./list-items";
import { targetColumn } from "./list-items";

// O banco já aceita produto e programa nas listas (0040) e nos favoritos (0041)? Pergunta ao próprio
// banco: o app pode ir ao ar antes da migração e, nesse intervalo, esconde o botão de lista e o
// coração de produto e programa. "Sim" fica guardado no processo (a coluna não some depois); "não" é
// perguntado de novo a cada minuto.

const RECHECK_MS = 60_000;

function columnProbe(table: "list_items" | "favorites") {
  let supported = false;
  let checkedAt = 0;
  return cache(async (): Promise<boolean> => {
    if (supported) return true;
    if (Date.now() - checkedAt < RECHECK_MS) return false;
    try {
      const supabase = await createClient();
      // limit 0: só valida a coluna, sem ler linhas
      const { error } = await supabase.from(table).select("item_type").limit(0);
      supported = !error;
    } catch {
      supported = false;
    }
    checkedAt = Date.now();
    return supported;
  });
}

export const mixedListsSupported = columnProbe("list_items");
export const mixedFavoritesSupported = columnProbe("favorites");

/**
 * Coração de produto/programa: null quando o banco ainda não tem a 0041 (a página esconde o botão);
 * senão, se a pessoa já favoritou (para o coração abrir cheio).
 */
export async function favoriteStatus(userId: string, target: ListTarget): Promise<{ favorite: boolean } | null> {
  if (!(await mixedFavoritesSupported())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("favorites").select("id").eq("user_id", userId).eq(targetColumn(target.kind), target.id).maybeSingle();
  if (error) return null;
  return { favorite: Boolean(data) };
}
