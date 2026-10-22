// Lógica pura de "Continue seus programas" (Perfil): os próximos passos dos programas ativos e o
// contador feito/total. Os itens de rotina manuais saíram do Hoje (F1 do Hoje com relógio): os dados
// continuam no banco, mas não há mais tela para criar, editar ou marcar. Sem React nem banco.

export type ProgramItemLike = {
  position: number;
  is_required: boolean;
  content: { id: string; slug: string; title: string; cover_url: string | null; creatorName: string | null } | null;
};

export type EnrollmentLike = {
  id: string;
  status: "active" | "completed" | "abandoned";
  programName: string;
  programSlug: string;
  items: ProgramItemLike[];
};

export type ProgramSuggestion = {
  enrollmentId: string;
  programName: string;
  programSlug: string;
  contentId: string;
  contentSlug: string;
  title: string;
  coverUrl: string | null;
  creatorName: string | null;
};

// Próximos itens obrigatórios não concluídos dos programas ativos: no máximo `perProgram` por
// programa e `max` no total, na ordem de posição. Itens sem conteúdo (apagado) são ignorados.
export function pickProgramSuggestions(enrollments: EnrollmentLike[], completedContentIds: Iterable<string>, max = 3, perProgram = 2): ProgramSuggestion[] {
  const completed = new Set(completedContentIds);
  const out: ProgramSuggestion[] = [];
  const seen = new Set<string>();
  for (const enrollment of enrollments) {
    if (enrollment.status !== "active") continue;
    let taken = 0;
    const items = [...enrollment.items].sort((a, b) => a.position - b.position);
    for (const item of items) {
      if (out.length >= max || taken >= perProgram) break;
      if (!item.is_required || !item.content) continue;
      if (completed.has(item.content.id) || seen.has(item.content.id)) continue;
      seen.add(item.content.id);
      taken++;
      out.push({
        enrollmentId: enrollment.id,
        programName: enrollment.programName,
        programSlug: enrollment.programSlug,
        contentId: item.content.id,
        contentSlug: item.content.slug,
        title: item.content.title,
        coverUrl: item.content.cover_url,
        creatorName: item.content.creatorName,
      });
    }
    if (out.length >= max) break;
  }
  return out;
}

// Contador "feito/total" do ritmo, sempre dentro de 0..total.
export function rhythmCounter(done: number, total: number): { done: number; total: number; label: string; complete: boolean } {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const safeDone = Math.min(safeTotal, Math.max(0, Math.floor(Number.isFinite(done) ? done : 0)));
  return { done: safeDone, total: safeTotal, label: `${safeDone}/${safeTotal}`, complete: safeTotal > 0 && safeDone === safeTotal };
}
