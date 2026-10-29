import "server-only";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { POST_PHOTO_SETTING, type PostPhotoState } from "./constants";

// Estado do envio de foto no composer, como o da capa (getHeroCoverState): "ready" (service role +
// chave ligada), "disabled" (kill switch desligado) ou "not_configured" (sem service role, ou banco
// ainda sem a 0043: a chave não existe em public_settings).
export async function getPostPhotoState(): Promise<PostPhotoState> {
  if (!hasAdminClient() || supabaseBaseUrl() === null) return "not_configured";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_settings");
    const settings = !error && data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
    if (!settings || !(POST_PHOTO_SETTING in settings)) return "not_configured";
    return settings[POST_PHOTO_SETTING] === true ? "ready" : "disabled";
  } catch {
    return "not_configured";
  }
}
