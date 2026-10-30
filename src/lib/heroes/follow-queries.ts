import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isCompareMetricKey, type CompareMetricKey } from "./compare";

// Leituras do seguir e da comparação. Seguir = hero_favorites (0054); Hero de comparação, contagem
// e referências = 0056. Sem a tabela no banco (ou com erro), cada parte volta "indisponível":
// botões, abas do feed e comparação somem e as páginas seguem normais.

type Client = SupabaseClient<Database>;

export type MyFollows = {
  /** hero_favorites existe e foi lido. */
  available: boolean;
  /** Ids dos heróis seguidos, do mais recente ao mais antigo. */
  ids: string[];
};

const UNAVAILABLE: MyFollows = { available: false, ids: [] };

/** O que a pessoa segue (RLS: só as próprias linhas). Visitante: disponível e vazio. */
export async function loadMyFollows(supabase: Client, userId: string | null): Promise<MyFollows> {
  if (!userId) return { available: true, ids: [] };
  try {
    const { data, error } = await supabase.from("hero_favorites").select("creator_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
    if (error) return UNAVAILABLE;
    return { available: true, ids: (data ?? []).map((r) => r.creator_id) };
  } catch {
    return UNAVAILABLE;
  }
}

/** Hero de comparação da pessoa (0056). undefined = indisponível (sem a 0056); null = nenhum. */
export async function loadCompareCreatorId(supabase: Client, userId: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await supabase.from("profiles").select("compare_creator_id").eq("id", userId).maybeSingle();
    if (error) return undefined;
    return data?.compare_creator_id ?? null;
  } catch {
    return undefined;
  }
}

/** Número de seguidores de um herói (público, sem identidades). null = indisponível. */
export async function loadFollowerCount(supabase: Client, creatorId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.from("creator_follower_counts").select("followers").eq("creator_id", creatorId).maybeSingle();
    if (error) return null;
    return data?.followers ?? 0;
  } catch {
    return null;
  }
}

export type ReferenceRow = { key: CompareMetricKey; value: number; unit: string; updatedAt: string | null };

/** Referências de comparação de um herói (definidas pela equipe). null = indisponível. */
export async function loadReferences(supabase: Client, creatorId: string): Promise<ReferenceRow[] | null> {
  try {
    const { data, error } = await supabase.from("creator_reference_metrics").select("metric_key, value, unit, updated_at").eq("creator_id", creatorId);
    if (error) return null;
    return (data ?? [])
      .filter((r) => isCompareMetricKey(r.metric_key))
      .map((r) => ({ key: r.metric_key as CompareMetricKey, value: Number(r.value), unit: r.unit, updatedAt: r.updated_at }));
  } catch {
    return null;
  }
}

export type FollowedHero = { id: string; slug: string; name: string; headline: string | null; avatarUrl: string | null };

/** Heróis seguidos com nome e foto (herói suspenso some pela RLS de creator_profiles). null = indisponível. */
export async function loadFollowedHeroes(supabase: Client, userId: string): Promise<FollowedHero[] | null> {
  try {
    const { data, error } = await supabase
      .from("hero_favorites")
      .select("created_at, creator:creator_profiles(id, slug, name, headline, avatar_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return null;
    type Row = { creator: { id: string; slug: string; name: string; headline: string | null; avatar_url: string | null } | null };
    return ((data ?? []) as unknown as Row[]).flatMap((r) =>
      r.creator ? [{ id: r.creator.id, slug: r.creator.slug, name: r.creator.name, headline: r.creator.headline, avatarUrl: r.creator.avatar_url }] : [],
    );
  } catch {
    return null;
  }
}
