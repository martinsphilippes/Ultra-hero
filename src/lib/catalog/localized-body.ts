import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LocaleCode } from "@/lib/supabase/helpers";

type Client = SupabaseClient<Database>;

/** PostgREST responde PGRST202 quando a função não existe no banco (remoto ainda sem a 0027). */
export function isMissingFunction(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST202";
}

// Corpo da tradução de um conteúdo. Desde a 0027 o select de content_localizations não expõe mais a
// coluna body (o visitante a lia mesmo sem acesso): o corpo sai pela RPC content_localized_body, que
// confere can_access_content. Banco sem a 0027 ainda não tem a RPC: aí lê a coluna como antes, para o
// app novo funcionar com o remoto antigo até a migração ser aplicada.
export async function loadLocalizedBody(supabase: Client, contentId: string, locale: LocaleCode): Promise<unknown> {
  const { data, error } = await supabase.rpc("content_localized_body", { p_content: contentId, p_locale: locale });
  if (!error) return data ?? null;
  if (!isMissingFunction(error)) return null;
  const { data: row } = await supabase
    .from("content_localizations")
    .select("body")
    .eq("content_id", contentId)
    .eq("locale", locale)
    .maybeSingle();
  return (row as { body?: unknown } | null)?.body ?? null;
}
