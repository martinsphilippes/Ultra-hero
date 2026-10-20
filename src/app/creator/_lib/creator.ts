import "server-only";
import { cache } from "react";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/helpers";

// Contexto da personalidade logada. my_creator_id() só devolve id quando o perfil está
// ativo e vinculado; fora disso o portal explica o motivo e fica somente leitura.

export type CreatorProfile = Pick<
  Tables<"creator_profiles">,
  "id" | "slug" | "name" | "headline" | "bio" | "pillars" | "avatar_url" | "cover_url" | "is_fictional" | "status" | "socials" | "rights_note"
>;

export type CreatorUnavailableReason = "inactive" | "unlinked";

export type CreatorContext = {
  userId: string | null;
  creatorId: string | null;
  profile: CreatorProfile | null;
  reason: "ok" | CreatorUnavailableReason;
};

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
