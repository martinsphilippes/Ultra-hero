import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { heroPickerHref, type HeroCard } from "@/lib/acting-hero/constants";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/helpers";
import type { CreatorSupabase } from "./content-insert";

// Contexto da personalidade logada. my_creator_id() só devolve id quando o perfil está
// ativo e vinculado; fora disso o portal explica o motivo e fica somente leitura.

export type CreatorProfile = Pick<
  Tables<"creator_profiles">,
  "id" | "slug" | "name" | "headline" | "bio" | "pillars" | "avatar_url" | "cover_url" | "is_fictional" | "status" | "socials" | "rights_note"
>;

export type CreatorUnavailableReason = "inactive" | "unlinked" | "acting_unavailable";

export type CreatorContext = {
  userId: string | null;
  creatorId: string | null;
  profile: CreatorProfile | null;
  reason: "ok" | CreatorUnavailableReason;
};

/** Contexto das telas do portal com o cliente certo (com o cabeçalho do herói no modo do admin). */
export type PortalCreatorContext = CreatorContext & { supabase: CreatorSupabase; acting: boolean };

const PROFILE_SELECT = "id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, status, socials, rights_note";

export const getMyCreator = cache(async (): Promise<CreatorContext> => {
  const user = await getUser();
  if (!user) return { userId: null, creatorId: null, profile: null, reason: "unlinked" };
  const supabase = await createClient();
  const [{ data: creatorId }, { data: profile }] = await Promise.all([
    supabase.rpc("my_creator_id"),
    supabase.from("creator_profiles").select(PROFILE_SELECT).eq("user_id", user.id).maybeSingle(),
  ]);
  const typedProfile = (profile as CreatorProfile | null) ?? null;
  const id = typeof creatorId === "string" && creatorId ? creatorId : null;
  return {
    userId: user.id,
    creatorId: id,
    profile: typedProfile,
    reason: id ? "ok" : typedProfile ? "inactive" : "unlinked",
  };
});

// Admin no fluxo "Publicar como hero": o herói escolhido (revalidado no banco). Sem escolha
// válida, volta ao seletor do início do admin; banco sem a 0045, estado "indisponível".
async function actingContext(card: HeroCard): Promise<PortalCreatorContext> {
  const user = await getUser();
  const acting = await getActingHero();
  if (acting.status === "none") redirect(heroPickerHref(card));
  const supabase = await createClient();
  if (acting.status === "unavailable") return { userId: user?.id ?? null, creatorId: null, profile: null, reason: "acting_unavailable", supabase, acting: true };
  const client = await actingClient(acting.hero.id);
  const { data: profile } = await client.from("creator_profiles").select(PROFILE_SELECT).eq("id", acting.hero.id).maybeSingle();
  if (!profile) redirect(heroPickerHref(card));
  return { userId: user?.id ?? null, creatorId: acting.hero.id, profile: profile as CreatorProfile, reason: "ok", supabase: client, acting: true };
}

/**
 * Telas de gestão do portal (painel, receitas, vínculos): só o admin, pelo herói escolhido.
 * O herói comum (e qualquer outra conta) volta para o Perfil, onde fica só o "Novo post".
 */
export async function getManagedCreator(card: HeroCard): Promise<PortalCreatorContext> {
  if (!(await hasRole("admin"))) redirect("/profile");
  return actingContext(card);
}

/** Novo post: o próprio herói, ou o admin pelo herói escolhido. */
export async function getPostingCreator(): Promise<PortalCreatorContext> {
  if (await hasRole("admin")) return actingContext("post");
  const [ctx, supabase] = await Promise.all([getMyCreator(), createClient()]);
  return { ...ctx, supabase, acting: false };
}
