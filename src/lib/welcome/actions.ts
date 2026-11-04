"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSeenWelcome, isWelcomeArea, welcomeMetaKey } from "./areas";

// Marca o card de boas-vindas da área como visto no user_metadata da própria conta (o updateUser mescla as chaves).
export async function markWelcomeSeenAction(area: string): Promise<{ ok: boolean }> {
  if (!isWelcomeArea(area)) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };
  if (hasSeenWelcome(data.user.user_metadata, area)) return { ok: true };
  const { error } = await supabase.auth.updateUser({ data: { [welcomeMetaKey(area)]: new Date().toISOString() } });
  return { ok: !error };
}
