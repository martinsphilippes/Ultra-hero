import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ACTING_HERO_COOKIE, isUuid } from "./constants";

// Herói em nome de quem o admin age. O cookie só lembra a última escolha: a cada requisição o banco
// confere (acting_hero_id(): admin + herói ativo) com o mesmo cabeçalho que as actions vão mandar.

export type ActingHero = { id: string; slug: string; name: string; avatar_url: string | null };

export type ActingHeroState =
  | { status: "ok"; hero: ActingHero }
  /** Sem escolha válida (sem cookie, herói suspenso, conta não admin). */
  | { status: "none" }
  /** Banco ainda sem a 0045. */
  | { status: "unavailable" };

export function isMissingFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

export const getActingHero = cache(async (): Promise<ActingHeroState> => {
  if (!(await hasRole("admin"))) return { status: "none" };
  const raw = (await cookies()).get(ACTING_HERO_COOKIE)?.value;
  if (!isUuid(raw)) return (await actingAvailable()) ? { status: "none" } : { status: "unavailable" };
  const id = raw.toLowerCase();
  const supabase = await createClient({ actingHeroId: id });
  const [{ data: confirmed, error }, { data: hero }] = await Promise.all([
    supabase.rpc("acting_hero_id"),
    supabase.from("creator_profiles").select("id, slug, name, avatar_url").eq("id", id).maybeSingle(),
  ]);
  if (error) return isMissingFunction(error) ? { status: "unavailable" } : { status: "none" };
  if (confirmed !== id || !hero) return { status: "none" };
  return { status: "ok", hero: hero as ActingHero };
});

/** O banco tem a 0045? (sem o cabeçalho a função devolve nulo; ausente = PGRST202). */
export const actingAvailable = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { error } = await supabase.rpc("acting_hero_id");
  return !isMissingFunction(error);
});

/** Cliente com o cabeçalho do herói escolhido (só faz efeito para admin; o banco confere). */
export function actingClient(heroId: string) {
  return createClient({ actingHeroId: heroId });
}
