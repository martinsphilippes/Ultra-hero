import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { portalHomeForAccepted, type AcceptedInvitation } from "./invite-home";

// Primeiro acesso do convidado (0077): quem foi convidado entra pela tela de entrar com o e-mail
// convidado e uma senha nova. O servidor confere que há convite pendente e válido para o e-mail, cria a
// conta já confirmada, entra e aceita os convites. Quem já tem conta recebe os convites ao entrar.

type Client = SupabaseClient<Database>;

/** Há convite pendente e dentro do prazo para este e-mail? (service role: a tabela não é pública) */
export async function hasPendingInvitation(admin: Client, email: string): Promise<boolean> {
  const { data, error } = await admin
    .from("invitations")
    .select("id")
    .eq("status", "pending")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .gte("expires_at", new Date().toISOString())
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

/**
 * Aceita os convites pendentes do e-mail da sessão e devolve a área a abrir (agência, marca…), ou nulo
 * quando não havia convite. Melhor esforço: nunca impede o login.
 */
export async function acceptMyInvitations(supabase: Client): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("accept_my_invitations");
    if (error) {
      if (!isMissingSchema(error)) console.warn("[convite] aceite no login falhou:", error.code ?? "erro");
      return null;
    }
    return portalHomeForAccepted((Array.isArray(data) ? data : []) as AcceptedInvitation[]);
  } catch {
    return null;
  }
}
