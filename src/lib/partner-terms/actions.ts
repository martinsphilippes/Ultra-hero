"use server";

import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PARTNER_TERMS_VERSION } from "./version";

type Result = { ok: true } | { ok: false; error: string };

// Confirmação de direitos antes do primeiro envio (0068). Sem aceite dos Termos do Parceiro na
// versão vigente (convite antigo), registra os dois juntos: a caixa da tela cobre os Termos e a declaração.
export async function confirmUploadRights(): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { error: acceptError } = await supabase.rpc("accept_partner_terms", { p_version: PARTNER_TERMS_VERSION });
    if (acceptError) return { ok: false, error: "generic" };
    const { error } = await supabase.rpc("confirm_upload_rights", { p_version: PARTNER_TERMS_VERSION });
    if (error) return { ok: false, error: "generic" };
    return { ok: true };
  } catch {
    return { ok: false, error: "generic" };
  }
}
