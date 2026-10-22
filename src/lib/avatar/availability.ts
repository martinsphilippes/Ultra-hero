import "server-only";
import { hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_SETTING } from "./constants";
import { supabaseBaseUrl } from "./paths";

// Estado do envio de foto para a tela: "ready" (service role + chave ligada), "disabled" (kill
// switch desligado) ou "not_configured" (sem service role, ou banco ainda sem a 0031: a chave não
// existe em public_settings). Remover a foto só depende do service role.
export type AvatarPhotoState = { upload: "ready" | "disabled" | "not_configured"; canRemove: boolean };

export async function getAvatarPhotoState(): Promise<AvatarPhotoState> {
  const configured = hasAdminClient() && supabaseBaseUrl() !== null;
  if (!configured) return { upload: "not_configured", canRemove: false };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_settings");
    const settings = !error && data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
    if (!settings || !(AVATAR_SETTING in settings)) return { upload: "not_configured", canRemove: true };
    return { upload: settings[AVATAR_SETTING] === true ? "ready" : "disabled", canRemove: true };
  } catch {
    return { upload: "not_configured", canRemove: true };
  }
}
