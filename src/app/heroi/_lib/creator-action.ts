import "server-only";
import { cookies } from "next/headers";
import { isUuid } from "@/lib/acting-hero/constants";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { getRoles, getUser, hasRole } from "@/lib/auth/session";
import { hasHeroRole } from "@/lib/auth/talent-scope";
import { MY_HERO_COOKIE } from "@/lib/creator-content/rules";
import { createClient } from "@/lib/supabase/server";
import type { ActionFailure } from "./action-utils";
import type { CreatorSupabase } from "./content-insert";

// Contexto das actions do herói. O herói em nome de quem se grava NUNCA vem do cliente:
//   * "manage" (conteúdos, receitas, vínculos): só o admin, pelo herói escolhido no seletor
//     (cookie revalidado no banco a cada chamada; o cliente leva o cabeçalho x-acting-hero, que o
//     banco só honra para admin com herói ativo — 0045). Herói comum: forbidden.
//   * "post" (Novo post): o herói em uso (my_creator_id(); em mais de uma equipe, o escolhido: x-my-hero), ou o admin pelo
//     herói escolhido.
//   * "own" (perfil de chef): só o próprio perfil, como antes; sem modo do admin.
//   * agência (0070): no "post", o herói dela escolhido no portal da agência (o banco confere o vínculo).
//   * "content" (0092, Novo conteúdo e Meus conteúdos): o admin pelo herói escolhido, ou o creator (titular ou membro)
//     pelo herói dele; com mais de uma equipe, o herói escolhido no seletor vai no cabeçalho x-my-hero e o banco só o
//     honra para membro ativo daquela equipe (my_creator_id). "recipes": igual, sempre no herói padrão (o Storage
//     das fotos não recebe o cabeçalho).
export type CreatorActionScope = "manage" | "post" | "own" | "content" | "recipes";

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

  // agência (0070): só o Novo post (foto e vídeo), pelo herói dela escolhido no portal da agência
  if (scope === "post" && (await hasRole("agency"))) {
    const acting = await getActingHero();
    if (acting.status === "ok") return { ok: true, userId: user.id, creatorId: acting.hero.id, supabase: await actingClient(acting.hero.id), actingFor: acting.hero.id };
    if (!hasHeroRole(await getRoles())) return { ok: false, error: acting.status === "unavailable" ? "acting_unavailable" : "acting_hero_required" };
  }

  // papel de herói (o creator com escopo "talent" é só do escritório e não reabre o Novo post)
  if (!hasHeroRole(await getRoles())) return { ok: false, error: "forbidden" };
  let myHeroId: string | null = null;
  if (scope === "content" || scope === "post") {
    const raw = (await cookies()).get(MY_HERO_COOKIE)?.value;
    myHeroId = isUuid(raw) ? raw.toLowerCase() : null;
  }
  const supabase = await createClient(myHeroId ? { myHeroId } : {});
  const { data: creatorId } = await supabase.rpc("my_creator_id");
  if (typeof creatorId !== "string" || !creatorId) return { ok: false, error: "creator_unavailable" };
  return { ok: true, userId: user.id, creatorId, supabase, actingFor: null };
}
