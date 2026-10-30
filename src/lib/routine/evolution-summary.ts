import "server-only";
import { createClient } from "@/lib/supabase/server";
import { pickProgramSuggestions, type EnrollmentLike, type ProgramSuggestion } from "./today";

// Dados do card Evolução do Hoje (Perfil e /profile/today): sequência atual, conteúdos concluídos e
// os próximos passos dos programas ativos ("Continue seus programas"). Só leitura.

export type EvolutionSummary = { currentStreak: number; completionsCount: number; suggestions: ProgramSuggestion[] };

// Inscrição ativa com os itens do programa (program_items + conteúdo + herói) para as sugestões do dia.
type EnrollmentWithItems = {
  id: string;
  status: "active" | "completed" | "abandoned";
  program: { slug: string } | null;
  version: {
    title: string;
    items: { position: number; is_required: boolean; content: { id: string; slug: string; title: string; cover_url: string | null; creator: { name: string } | null } | null }[];
  } | null;
};

const ENROLLMENT_SELECT =
  "id, status, program:programs(slug), version:program_versions(title, items:program_items(position, is_required, content:content(id, slug, title, cover_url, creator:creator_profiles(name))))";

export async function loadEvolutionSummary(userId: string, timeZone: string): Promise<EvolutionSummary> {
  const supabase = await createClient();
  const [enrollmentsRes, completionsRes, streakRes] = await Promise.all([
    supabase.from("enrollments").select(ENROLLMENT_SELECT).eq("user_id", userId).eq("status", "active").order("enrolled_at", { ascending: false }),
    supabase.from("completions").select("content_id").eq("user_id", userId).limit(2000),
    supabase.rpc("compute_streak", { p_user: userId, p_timezone: timeZone }),
  ]);
  const completed = (completionsRes.data ?? []).map((c) => c.content_id);
  const enrollments: EnrollmentLike[] = ((enrollmentsRes.data ?? []) as unknown as EnrollmentWithItems[]).map((e) => ({
    id: e.id,
    status: e.status,
    programName: e.version?.title ?? "",
    programSlug: e.program?.slug ?? "",
    items: (e.version?.items ?? []).map((i) => ({
      position: i.position,
      is_required: i.is_required,
      content: i.content ? { id: i.content.id, slug: i.content.slug, title: i.content.title, cover_url: i.content.cover_url, creatorName: i.content.creator?.name ?? null } : null,
    })),
  }));
  return { currentStreak: Number(streakRes.data ?? 0), completionsCount: completed.length, suggestions: pickProgramSuggestions(enrollments, completed) };
}
