import "server-only";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionFailure } from "./action-utils";
import type { CreatorSupabase } from "./content-insert";

// Contexto das actions do herói. O herói em nome de quem se grava NUNCA vem do cliente:
//   * "manage" (conteúdos, receitas, vínculos): só o admin, pelo herói escolhido no seletor
//     (cookie revalidado no banco a cada chamada; o cliente leva o cabeçalho x-acting-hero, que o
//     banco só honra para admin com herói ativo — 0045). Herói comum: forbidden.
//   * "post" (Novo post): o herói com o próprio perfil ativo (my_creator_id()), ou o admin pelo
//     herói escolhido.
//   * "own" (perfil de chef): só o próprio perfil, como antes; sem modo do admin.
export type CreatorActionScope = "manage" | "post" | "own";

export type CreatorActionContext = {
  ok: true;
  userId: string;
  creatorId: string;
  supabase: CreatorSupabase;
  /** Herói em nome de quem o admin age (null quando é o próprio herói). */
  actingFor: string | null;
};

export async function creatorActionContext(scope: CreatorActionScope = "manage"): Promise<CreatorActionContext | ActionFailure> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (scope !== "own" && (await hasRole("admin"))) {
    const acting = await getActingHero();
    if (acting.status === "unavailable") return { ok: false, error: "acting_unavailable" };
    if (acting.status !== "ok") return { ok: false, error: "acting_hero_required" };
    return { ok: true, userId: user.id, creatorId: acting.hero.id, supabase: await actingClient(acting.hero.id), actingFor: acting.hero.id };
  }
  if (scope === "manage") return { ok: false, error: "forbidden" };

  if (!(await hasRole("creator"))) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data: creatorId } = await supabase.rpc("my_creator_id");
  if (typeof creatorId !== "string" || !creatorId) return { ok: false, error: "creator_unavailable" };
  return { ok: true, userId: user.id, creatorId, supabase, actingFor: null };
}
