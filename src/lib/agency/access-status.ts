import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { toAccessState, type AccessKind, type AccessStatus } from "./access-contact";

// Situação do acesso de cada talento/marca da agência (0112, agency_access_status: gestor+ e admin geral). Banco sem a
// migração ou sem permissão: mapa vazio (a tela segue sem o selo).
export async function loadAccessStatus(supabase: SupabaseClient<Database>, agencyId: string, kind: AccessKind): Promise<Map<string, AccessStatus>> {
  const out = new Map<string, AccessStatus>();
  try {
    const { data, error } = await supabase.rpc("agency_access_status", { p_agency: agencyId, p_kind: kind });
    if (error) return out;
    for (const row of data ?? []) {
      out.set(row.target_id, {
        targetId: row.target_id,
        creatorId: row.creator_id,
        contactName: row.contact_name,
        email: row.email,
        phone: row.phone_e164,
        state: toAccessState(row.account),
        inviteExpiresAt: row.invite_expires_at,
        loginEmail: row.login_email,
      });
    }
  } catch {
    // sem o selo
  }
  return out;
}
