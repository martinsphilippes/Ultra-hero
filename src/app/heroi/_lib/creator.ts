import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { heroPickerHref, isUuid, type HeroCard } from "@/lib/acting-hero/constants";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { getRoles, getUser, hasRole } from "@/lib/auth/session";
import { hasHeroRole } from "@/lib/auth/talent-scope";
import { MY_HERO_COOKIE, canRemovePublished, heroSelectable, pickMyHero, type HeroStatus } from "@/lib/creator-content/rules";
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
  /** 0091: papel na equipe do herói (o membro posta, mas não edita perfil, foto nem capa). */
  teamRole?: "owner" | "member" | null;
};

/** Contexto das telas do portal com o cliente certo (com o cabeçalho do herói no modo do admin). */
export type PortalCreatorContext = CreatorContext & { supabase: CreatorSupabase; acting: boolean };

const PROFILE_SELECT = "id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, status, socials, rights_note";

export const getMyCreator = cache(async (): Promise<CreatorContext> => {
  const user = await getUser();
  if (!user) return { userId: null, creatorId: null, profile: null, reason: "unlinked" };
  const supabase = await createClient();
  // 0091: o herói pode ser da pessoa (titular) ou de uma equipe em que ela está (membro); my_creator_id já
  // considera os dois (só ativo). Sem herói ativo, o da equipe (pendente/inativo) explica o motivo.
  const [{ data: creatorId }, { data: team }] = await Promise.all([supabase.rpc("my_creator_id"), supabase.rpc("my_hero_team")]);
  const id = typeof creatorId === "string" && creatorId ? creatorId : null;
  const teamHero = team && typeof team === "object" && !Array.isArray(team) ? (team as { creator_id?: string; role?: string }) : null;
  const profileId = id ?? teamHero?.creator_id ?? null;
  const { data: profile } = profileId
    ? await supabase.from("creator_profiles").select(PROFILE_SELECT).eq("id", profileId).maybeSingle()
    : await supabase.from("creator_profiles").select(PROFILE_SELECT).eq("user_id", user.id).maybeSingle();
  const typedProfile = (profile as CreatorProfile | null) ?? null;
  return {
    userId: user.id,
    creatorId: id,
    profile: typedProfile,
    reason: id ? "ok" : typedProfile ? "inactive" : "unlinked",
    teamRole: teamHero?.role === "member" ? "member" : typedProfile ? "owner" : null,
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
  const [ctx, heroes] = await Promise.all([getMyCreator(), listMyHeroes()]);
  // 0092: quem está em mais de uma equipe posta pelo herói escolhido (o banco só honra para membro ativo)
  const chosen = heroes.length > 1 ? await chosenHeroId(heroes, ctx.creatorId) : ctx.creatorId;
  if (chosen && chosen !== ctx.creatorId) {
    const supabase = await createClient({ myHeroId: chosen });
    const { data: profile } = await supabase.from("creator_profiles").select(PROFILE_SELECT).eq("id", chosen).maybeSingle();
    return { ...ctx, creatorId: chosen, profile: (profile as CreatorProfile | null) ?? ctx.profile, reason: "ok", teamRole: heroes.find((h) => h.id === chosen)?.role ?? null, supabase, acting: false };
  }
  return { ...ctx, supabase: await createClient(), acting: false };
}

/** Herói de que a pessoa faz parte (titular ou membro ativo, herói ativo). */
export type MyHero = { id: string; name: string; slug: string; avatar_url: string | null; role: "owner" | "member"; status: HeroStatus };

/** Todos os heróis da pessoa (titular ou membro ativo da equipe), com situação — inclusive pendente e suspenso (cartão do Perfil). */
export const listMyHeroesAll = cache(async (): Promise<MyHero[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("creator_team_members")
    .select("role, created_at, hero:creator_profiles(id, name, slug, avatar_url, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at");
  type Row = { role: string; hero: { id: string; name: string; slug: string; avatar_url: string | null; status: string } | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.hero !== null)
    .map((r) => ({
      id: r.hero!.id,
      name: r.hero!.name,
      slug: r.hero!.slug,
      avatar_url: r.hero!.avatar_url,
      role: r.role === "owner" ? ("owner" as const) : ("member" as const),
      status: (["active", "pending", "suspended"].includes(r.hero!.status) ? r.hero!.status : "suspended") as HeroStatus,
    }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
});

/** Heróis em que dá para criar (ativo ou pendente), titular primeiro: o seletor de quem está em mais de uma equipe (0091/0092). */
export const listMyHeroes = cache(async (): Promise<MyHero[]> => (await listMyHeroesAll()).filter((h) => heroSelectable(h.status)));

/** Herói em uso por quem está em mais de uma equipe: o escolhido (cookie), se ainda vale, senão o padrão do banco. */
export async function chosenHeroId(heroes: readonly { id: string }[], fallback: string | null): Promise<string | null> {
  const raw = (await cookies()).get(MY_HERO_COOKIE)?.value;
  return pickMyHero(heroes, isUuid(raw) ? raw.toLowerCase() : null, fallback);
}

/** Contexto de "Meus conteúdos"/"Novo conteúdo"/receitas: herói em uso, heróis da pessoa e o que ela pode remover. */
export type ContentWorkspace = PortalCreatorContext & {
  heroes: MyHero[];
  teamRole: "owner" | "member" | null;
  /** Tirar do ar/arquivar/excluir o que já esteve no ar (titular ou admin; o banco confere). */
  canRemove: boolean;
  isAdmin: boolean;
  /** Herói padrão da pessoa (my_creator_id sem escolha): receitas saem por ele. */
  defaultHeroId: string | null;
};

/**
 * Telas de conteúdo do portal (0092): o admin segue pelo herói escolhido em "Publicar como hero"; o creator (titular
 * ou membro, com papel de herói) usa o herói dele. `followChoice`: honra o herói escolhido no seletor (cookie
 * revalidado no banco pelo cabeçalho x-my-hero); as receitas não seguem (o Storage não recebe o cabeçalho). Conta
 * sem papel de herói volta ao Perfil.
 */
export async function getContentWorkspace(card: HeroCard, options: { followChoice: boolean }): Promise<ContentWorkspace> {
  if (await hasRole("admin")) {
    const ctx = await actingContext(card);
    return { ...ctx, heroes: [], teamRole: null, canRemove: true, isAdmin: true, defaultHeroId: ctx.creatorId };
  }
  if (!hasHeroRole(await getRoles())) redirect("/profile");
  const [base, heroes, cookieStore] = await Promise.all([getMyCreator(), listMyHeroes(), cookies()]);
  const raw = cookieStore.get(MY_HERO_COOKIE)?.value;
  const chosen = options.followChoice ? pickMyHero(heroes, isUuid(raw) ? raw.toLowerCase() : null, base.creatorId) : base.creatorId;
  if (!chosen || chosen === base.creatorId) {
    const supabase = await createClient();
    const teamRole = heroes.find((h) => h.id === base.creatorId)?.role ?? base.teamRole ?? null;
    return { ...base, supabase, acting: false, heroes, teamRole, canRemove: canRemovePublished({ teamRole, isAdmin: false }), isAdmin: false, defaultHeroId: base.creatorId };
  }
  const supabase = await createClient({ myHeroId: chosen });
  const { data: profile } = await supabase.from("creator_profiles").select(PROFILE_SELECT).eq("id", chosen).maybeSingle();
  const teamRole = heroes.find((h) => h.id === chosen)?.role ?? null;
  return {
    userId: base.userId,
    creatorId: chosen,
    profile: (profile as CreatorProfile | null) ?? null,
    reason: "ok",
    supabase,
    acting: false,
    heroes,
    teamRole,
    canRemove: canRemovePublished({ teamRole, isAdmin: false }),
    isAdmin: false,
    defaultHeroId: base.creatorId,
  };
}
