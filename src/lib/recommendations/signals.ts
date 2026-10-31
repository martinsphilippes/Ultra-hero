// Sinais agregados do usuário para o motor: interesses, afinidade de pilar (30 dias), nível e módulos com direito.
// Nada de nome, e-mail ou texto livre sai daqui.
import type { Pillar } from "@/lib/supabase/helpers";
import type { Db } from "./candidates";
import type { Difficulty, UiLocale, UserSignals } from "./types";

const DIFFICULTY_INDEX: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const LOCALES: UiLocale[] = ["pt-BR", "en", "es"];
const WINDOW_DAYS = 30;

type ContentRef = { pillar: Pillar; difficulty?: string | null } | { pillar: Pillar; difficulty?: string | null }[] | null;

function one(ref: ContentRef) {
  return Array.isArray(ref) ? ref[0] ?? null : ref;
}

export function visitorSignals(locale: UiLocale): UserSignals {
  return { userId: null, locale, interests: [], pillarAffinity: {}, difficultyLevel: "beginner", completedCount: 0 };
}

export async function loadSignals(db: Db, userId: string, fallbackLocale: UiLocale = "pt-BR"): Promise<UserSignals> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const [profile, interests, recent, total, progress] = await Promise.all([
    db.from("profiles").select("locale").eq("id", userId).maybeSingle(),
    db.from("user_interests").select("tag").eq("user_id", userId),
    db.from("completions").select("completed_at, content:content(pillar, difficulty)").eq("user_id", userId).gte("completed_at", since).order("completed_at", { ascending: false }).limit(60),
    db.from("completions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("content_progress").select("updated_at, content:content(pillar)").eq("user_id", userId).gte("updated_at", since).order("updated_at", { ascending: false }).limit(60),
  ]);

  const pillarAffinity: Partial<Record<Pillar, number>> = {};
  let difficultySum = 0;
  let difficultyCount = 0;
  for (const row of recent.data ?? []) {
    const content = one(row.content as ContentRef);
    if (!content) continue;
    pillarAffinity[content.pillar] = (pillarAffinity[content.pillar] ?? 0) + 1;
    if (content.difficulty && content.difficulty in DIFFICULTY_INDEX) {
      difficultySum += DIFFICULTY_INDEX[content.difficulty as Difficulty];
      difficultyCount += 1;
    }
  }
  for (const row of progress.data ?? []) {
    const content = one(row.content as ContentRef);
    if (!content) continue;
    pillarAffinity[content.pillar] = (pillarAffinity[content.pillar] ?? 0) + 0.5;
  }

  const averageIndex = difficultyCount > 0 ? difficultySum / difficultyCount : 0;
  const difficultyLevel: Difficulty = averageIndex >= 1.5 ? "advanced" : averageIndex >= 0.75 ? "intermediate" : "beginner";
  const locale = LOCALES.includes(profile.data?.locale as UiLocale) ? (profile.data?.locale as UiLocale) : fallbackLocale;

  return {
    userId,
    locale,
    interests: (interests.data ?? []).map((row) => row.tag),
    pillarAffinity,
    difficultyLevel,
    completedCount: total.count ?? 0,
  };
}
