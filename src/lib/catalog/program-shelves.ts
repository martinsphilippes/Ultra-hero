import "server-only";
import { CONTENT_TILE_SELECT, type ContentTileData } from "@/components/discover/explore/tiles";
import { getUser } from "@/lib/auth/session";
import {
  nextStepIndex,
  orderShelves,
  pickEnrollment,
  resolveShelfSteps,
  shelfProgress,
  shelfStepState,
  type ShelfEnrollment,
  type ShelfItemRow,
  type ShelfStep,
  type ShelfStepState,
  type ShelfSubstitutionRow,
} from "@/lib/catalog/program-shelf";
import type { ProgramCardData } from "@/lib/catalog/queries";
import type { LocaleCode, Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Dados das prateleiras de programas (biblioteca "Programas" do herói). Tudo em lote: uma consulta
// por tabela para todos os programas da página, nunca uma por programa (sem N+1).

/** Programa como vem do hub do herói, com a versão atual (para buscar as etapas). */
export type ProgramShelfSource = ProgramCardData & { current_version_id: string | null };

export type ShelfContent = ContentTileData & { duration_minutes: number | null };

export type ShelfStepData = { step: ShelfStep; content: ShelfContent | null; state: ShelfStepState };

export type ProgramShelfData = {
  id: string;
  slug: string;
  pillar: Pillar;
  title: string;
  summary: string | null;
  estimatedWeeks: number | null;
  enrollment: "active" | "completed" | null;
  steps: ShelfStepData[];
  progress: { done: number; total: number } | null;
  /** Conteúdo da próxima etapa para "Continuar" (só com inscrição ativa). */
  nextContentSlug: string | null;
};

const SHELF_CONTENT_SELECT = `${CONTENT_TILE_SELECT}, duration_minutes`;

export async function loadProgramShelves(programs: readonly ProgramShelfSource[], locale: LocaleCode): Promise<{ shelves: ProgramShelfData[]; error: boolean }> {
  if (programs.length === 0) return { shelves: [], error: false };
  const [supabase, user] = await Promise.all([createClient(), getUser()]);
  const programIds = programs.map((program) => program.id);

  // 1) Inscrições da pessoa nestes programas: a prateleira mostra a versão em que ela está (como a página do programa).
  const enrollmentRes = user
    ? await supabase.from("enrollments").select("program_id, version_id, status, enrolled_at").eq("user_id", user.id).in("program_id", programIds)
    : null;
  const enrollments = (enrollmentRes?.data ?? []) as ShelfEnrollment[];
  const ordered = orderShelves(programs, enrollments);
  const versionOf = new Map(ordered.map((program) => [program.id, pickEnrollment(enrollments, program.id)?.version_id ?? program.current_version_id]));
  const versionIds = Array.from(new Set([...versionOf.values()].filter((id): id is string => Boolean(id))));
  if (versionIds.length === 0) return { shelves: [], error: Boolean(enrollmentRes?.error) };

  // 2) Versões, traduções, etapas e substituições, em paralelo.
  const [versionsRes, locRes, itemsRes, subsRes] = await Promise.all([
    supabase.from("program_versions").select("id, title, summary, estimated_weeks").in("id", versionIds),
    supabase.from("program_localizations").select("version_id, title, summary").in("version_id", versionIds).eq("locale", locale).eq("status", "published"),
    supabase.from("program_items").select("version_id, content_id, position, section, is_required").in("version_id", versionIds).order("position").limit(1000),
    supabase.from("program_item_substitutions").select("version_id, original_content_id, replacement_content_id").in("version_id", versionIds),
  ]);
  const items = (itemsRes.data ?? []) as ShelfItemRow[];
  const substitutions = (subsRes.data ?? []) as ShelfSubstitutionRow[];
  const stepsByVersion = new Map(versionIds.map((id) => [id, resolveShelfSteps(id, items, substitutions)]));

  // 3) Conteúdos das etapas (a RLS esconde os fora do ar) e conclusões da pessoa (efetivo ou original).
  const allSteps = [...stepsByVersion.values()].flat();
  const contentIds = Array.from(new Set(allSteps.map((step) => step.contentId)));
  const matchIds = Array.from(new Set(allSteps.flatMap((step) => [step.contentId, step.originalContentId])));
  const [contentRes, completionsRes] = await Promise.all([
    contentIds.length > 0 ? supabase.from("content").select(SHELF_CONTENT_SELECT).in("id", contentIds) : null,
    user && matchIds.length > 0 ? supabase.from("completions").select("content_id").eq("user_id", user.id).in("content_id", matchIds) : null,
  ]);
  const contentById = new Map(((contentRes?.data ?? []) as unknown as ShelfContent[]).map((content) => [content.id, content]));
  const completedIds = new Set((completionsRes?.data ?? []).map((row) => row.content_id));
  const versions = new Map((versionsRes.data ?? []).map((version) => [version.id, version]));
  const localized = new Map((locRes.data ?? []).map((loc) => [loc.version_id, loc]));

  const shelves = ordered.flatMap((program): ProgramShelfData[] => {
    const versionId = versionOf.get(program.id);
    if (!versionId) return [];
    const version = versions.get(versionId);
    const loc = localized.get(versionId);
    const enrollment = pickEnrollment(enrollments, program.id);
    const enrolled = Boolean(enrollment);
    const steps = (stepsByVersion.get(versionId) ?? []).map((step) => {
      const content = contentById.get(step.contentId) ?? null;
      return { step, content, state: shelfStepState({ step, content, enrolled, completedIds }) };
    });
    const states = steps.map((s) => s.state);
    const next = enrollment?.status === "active" ? nextStepIndex(steps.map((s) => s.step), states) : -1;
    return [
      {
        id: program.id,
        slug: program.slug,
        pillar: program.pillar,
        title: loc?.title ?? version?.title ?? program.version?.title ?? program.slug,
        summary: loc?.summary ?? version?.summary ?? program.version?.summary ?? null,
        estimatedWeeks: version?.estimated_weeks ?? program.version?.estimated_weeks ?? null,
        enrollment: enrollment?.status === "active" || enrollment?.status === "completed" ? enrollment.status : null,
        steps,
        progress: enrolled ? shelfProgress(steps.map((s) => s.step), states) : null,
        nextContentSlug: next >= 0 ? (steps[next].content?.slug ?? null) : null,
      },
    ];
  });

  const error = Boolean(enrollmentRes?.error || versionsRes.error || itemsRes.error || subsRes.error || contentRes?.error);
  return { shelves, error };
}
