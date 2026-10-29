"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { ACTING_HERO_COOKIE, ACTING_HERO_MAX_AGE, HERO_CARDS, heroCardHref } from "@/lib/acting-hero/constants";
import { isMissingFunction } from "@/lib/acting-hero/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// "Publicar como hero": o admin toca num herói do seletor. O banco confere admin e herói ativo e
// audita a escolha (admin_act_as_hero, 0045); só então o cookie lembra o herói e a tela abre o fluxo.

export type ChooseHeroResult = { ok: true; href: string } | { ok: false; error: string };

const input = z.object({ heroId: z.uuid(), card: z.enum(HERO_CARDS) });

export async function chooseActingHero(heroId: string, card: string): Promise<ChooseHeroResult> {
  const parsed = input.safeParse({ heroId, card });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!(await hasRole("admin"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_act_as_hero", { p_creator: parsed.data.heroId });
  if (error) {
    if (isMissingFunction(error)) return { ok: false, error: "acting_unavailable" };
    if (error.message?.includes("hero_unavailable")) return { ok: false, error: "hero_unavailable" };
    return { ok: false, error: error.message?.includes("forbidden") ? "forbidden" : "generic" };
  }
  const id = (data as { id?: string } | null)?.id;
  if (id !== parsed.data.heroId) return { ok: false, error: "generic" };

  (await cookies()).set(ACTING_HERO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTING_HERO_MAX_AGE,
  });
  return { ok: true, href: heroCardHref(parsed.data.card, id) };
}
