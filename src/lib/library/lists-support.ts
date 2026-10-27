import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// O banco já aceita produto e programa nas listas (migração 0040)? Pergunta ao próprio banco: o app
// pode ir ao ar antes da migração e, nesse intervalo, esconde o botão de lista de produto e programa.
// "Sim" fica guardado no processo (a coluna não some depois); "não" é perguntado de novo a cada minuto.

const RECHECK_MS = 60_000;
let supported = false;
let checkedAt = 0;

export const mixedListsSupported = cache(async (): Promise<boolean> => {
  if (supported) return true;
  if (Date.now() - checkedAt < RECHECK_MS) return false;
  try {
    const supabase = await createClient();
    // limit 0: só valida a coluna, sem ler linhas
    const { error } = await supabase.from("list_items").select("item_type").limit(0);
    supported = !error;
  } catch {
    supported = false;
  }
  checkedAt = Date.now();
  return supported;
});
