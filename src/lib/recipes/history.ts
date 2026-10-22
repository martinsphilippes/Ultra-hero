// Histórico de receitas vistas (decisão 6): desligado por padrão, liga só por escolha da pessoa na
// coleção, guarda só o último acesso por receita (recipe_view_history, 0027) e some depois de 90 dias
// (run_retention). Desligar apaga tudo (gatilho do banco) e por isso pede confirmação. Regras puras;
// a gravação e as actions usam o cliente do usuário (a RLS só aceita a própria linha).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const RECIPE_HISTORY_RETENTION_DAYS = 90;
export const RECIPE_HISTORY_LIMIT = 100;

/** Data a partir da qual o histórico ainda vale (a rotina diária apaga o resto; a tela já esconde). */
export function historyCutoff(now: Date | number = Date.now()): Date {
  const ms = typeof now === "number" ? now : now.getTime();
  return new Date(ms - RECIPE_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export type HistoryChange = "enable" | "disable" | "needs_confirmation" | "noop";

/** Ligar é direto; desligar apaga o histórico, então só segue com a confirmação explícita. */
export function decideHistoryChange(current: boolean, requested: boolean, confirmed: boolean): HistoryChange {
  if (current === requested) return "noop";
  if (requested) return "enable";
  return confirmed ? "disable" : "needs_confirmation";
}

/** Tabela ou coluna ausente (banco sem a 0027): o histórico fica "indisponível" em vez de quebrar. */
export function isMissingRelation(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST204" || error.code === "42703";
}

type Client = SupabaseClient<Database>;

export type HistoryPref = { available: boolean; enabled: boolean; enabledAt: string | null };

export async function loadHistoryPref(supabase: Client, userId: string): Promise<HistoryPref> {
  const { data, error } = await supabase.from("user_recipe_prefs").select("history_enabled, history_enabled_at").eq("user_id", userId).maybeSingle();
  // sem a tabela (ou falha de leitura) o histórico conta como desligado: nada é gravado
  if (error) return { available: false, enabled: false, enabledAt: null };
  return { available: true, enabled: Boolean(data?.history_enabled), enabledAt: data?.history_enabled_at ?? null };
}

/**
 * Registra o acesso à receita quando a pessoa ligou o histórico. Só o último acesso: insere e, se a
 * linha já existe, atualiza viewed_at (o banco põe now(); o cliente não escolhe a data). Não usa upsert
 * do PostgREST porque o "do update" reescreveria content_id, fora do grant de update.
 */
export async function recordRecipeView(supabase: Client, userId: string, contentId: string): Promise<"recorded" | "disabled" | "unavailable"> {
  const pref = await loadHistoryPref(supabase, userId);
  if (!pref.available) return "unavailable";
  if (!pref.enabled) return "disabled";
  const { error } = await supabase.from("recipe_view_history").insert({ content_id: contentId });
  if (!error) return "recorded";
  if (error.code !== "23505") return isMissingRelation(error) ? "unavailable" : "disabled";
  const { error: updateError } = await supabase
    .from("recipe_view_history")
    .update({ viewed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("content_id", contentId);
  return updateError ? "disabled" : "recorded";
}
