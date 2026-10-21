import "server-only";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionFailure } from "./action-utils";
import type { CreatorSupabase } from "./content-insert";

// Contexto das actions do herói: usuário e creator_id SEMPRE da sessão. my_creator_id() só
// devolve id com perfil ativo e vinculado; admin sem perfil de herói não posta em nome de ninguém.
export type CreatorActionContext = { ok: true; userId: string; creatorId: string; supabase: CreatorSupabase };

export async function creatorActionContext(): Promise<CreatorActionContext | ActionFailure> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!(await hasRole("creator"))) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data: creatorId } = await supabase.rpc("my_creator_id");
  if (typeof creatorId !== "string" || !creatorId) return { ok: false, error: "creator_unavailable" };
  return { ok: true, userId: user.id, creatorId, supabase };
}
