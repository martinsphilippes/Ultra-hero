"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { MY_HERO_COOKIE, heroSelectable } from "@/lib/creator-content/rules";
import { ACTING_HERO_MAX_AGE } from "@/lib/acting-hero/constants";
import type { ActionResult } from "@/components/editors/types";
import { listMyHeroesAll } from "../_lib/creator";

// Creator em mais de uma equipe de Hero (0091/0092): escolhe por qual Hero cria e edita conteúdo. O cookie só
// lembra a escolha; a cada requisição o servidor confere a lista e o banco confere de novo (x-my-hero).
export async function chooseMyHero(input: { heroId: string }): Promise<ActionResult> {
  const parsed = z.object({ heroId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const heroes = await listMyHeroesAll();
  if (!heroes.some((h) => h.id === parsed.data.heroId)) return { ok: false, error: "forbidden" };
  const hero = heroes.find((h) => h.id === parsed.data.heroId);
  if (!hero || !heroSelectable(hero.status)) return { ok: false, error: "forbidden" };
  (await cookies()).set(MY_HERO_COOKIE, parsed.data.heroId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTING_HERO_MAX_AGE,
  });
  return { ok: true };
}
