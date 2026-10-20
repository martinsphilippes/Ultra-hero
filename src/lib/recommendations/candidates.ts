// Candidatos = catálogo publicado com regra de acesso, menos concluídos e "não tenho interesse" do usuário.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Candidate, Difficulty } from "./types";
import { MAX_CANDIDATES } from "./types";

export type Db = SupabaseClient<Database>;

const CANDIDATE_SELECT =
  "id, pillar, type, difficulty, tags, access_level, required_module_id, is_featured, published_at, required_module:plan_modules(name)";

type Row = {
  id: string;
  pillar: Candidate["pillar"];
  type: Candidate["type"];
  difficulty: string | null;
  tags: string[] | null;
  access_level: Candidate["access_level"] | null;
  required_module_id: string | null;
  is_featured: boolean;
  published_at: string | null;
  required_module: { name: string } | { name: string }[] | null;
};

const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];

function toCandidate(row: Row): Candidate {
  const requiredModule = Array.isArray(row.required_module) ? row.required_module[0] : row.required_module;
  return {
    content_id: row.id,
    pillar: row.pillar,
    type: row.type,
    difficulty: DIFFICULTIES.includes(row.difficulty as Difficulty) ? (row.difficulty as Difficulty) : null,
    tags: row.tags ?? [],
    access_level: row.access_level ?? "free",
    required_module_id: row.required_module_id,
    required_module_name: requiredModule?.name ?? null,
    is_featured: row.is_featured,
    published_at: row.published_at,
  };
}

// Ids que nunca devem ser recomendados a este usuário (já concluiu ou pediu para ocultar).
export async function loadExcludedContentIds(db: Db, userId: string): Promise<Set<string>> {
  const [completed, dismissed] = await Promise.all([
    db.from("completions").select("content_id").eq("user_id", userId),
    db.from("not_interested").select("content_id").eq("user_id", userId),
  ]);
  if (completed.error) throw new Error(completed.error.message);
  if (dismissed.error) throw new Error(dismissed.error.message);
  const ids = new Set<string>();
  for (const row of completed.data ?? []) ids.add(row.content_id);
  for (const row of dismissed.data ?? []) ids.add(row.content_id);
  return ids;
}

export async function loadCandidates(db: Db, userId: string | null, max = MAX_CANDIDATES): Promise<Candidate[]> {
  const excluded = userId ? await loadExcludedContentIds(db, userId) : new Set<string>();
  const { data, error } = await db
    .from("content")
    .select(CANDIDATE_SELECT)
    .eq("status", "published")
    .not("access_level", "is", null)
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(max + excluded.size);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.access_level !== null && !excluded.has(row.id))
    .slice(0, max)
    .map(toCandidate);
}
