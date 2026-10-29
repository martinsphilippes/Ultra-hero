import "server-only";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { COVER_SETTING } from "./constants";

// Estado do envio de capa para a tela, como o da foto (getAvatarPhotoState): "ready" (service role
// + chave ligada), "disabled" (kill switch desligado) ou "not_configured" (sem service role, ou banco
// ainda sem a 0042: a chave não existe em public_settings). Sem a 0042 também não há como remover
// (a RPC hero_cover_clear não existe), então canRemove acompanha.
export type HeroCoverState = { upload: "ready" | "disabled" | "not_configured"; canRemove: boolean };

export async function getHeroCoverState(): Promise<HeroCoverState> {
  const configured = hasAdminClient() && supabaseBaseUrl() !== null;
  if (!configured) return { upload: "not_configured", canRemove: false };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_settings");
    const settings = !error && data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
    if (!settings || !(COVER_SETTING in settings)) return { upload: "not_configured", canRemove: false };
    return { upload: settings[COVER_SETTING] === true ? "ready" : "disabled", canRemove: true };
  } catch {
    return { upload: "not_configured", canRemove: false };
  }
}
