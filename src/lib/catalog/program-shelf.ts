// Prateleira de programa (estilo playlist): regras puras, sem Supabase, para testar em unidade.
// A página carrega program_items + program_item_substitutions de TODOS os programas numa consulta
// cada e resolve aqui as etapas — o mesmo resultado da RPC program_required_items (cenário S39).
import type { AccessLevel } from "@/lib/supabase/helpers";

export type ShelfItemRow = {
  version_id: string;
  content_id: string;
  position: number;
  section: string | null;
  is_required: boolean;
};

export type ShelfSubstitutionRow = { version_id: string; original_content_id: string; replacement_content_id: string };

export type ShelfStep = {
  /** Conteúdo efetivo (o substituto, quando houver). */
  contentId: string;
  /** Conteúdo original da versão (conclusão vale por qualquer um dos dois, como no banco). */
  originalContentId: string;
  position: number;
  section: string | null;
  isRequired: boolean;
  substituted: boolean;
};

/**
 * Etapas de uma versão com as substituições aplicadas (= program_required_items), na ordem da página
 * do programa: por position e agrupadas por seção na ordem em que cada uma aparece primeiro — o admin
 * pode intercalar seções, e "Etapa 2 de 3" tem de ser o mesmo item nos dois lugares.
 */
export function resolveShelfSteps(versionId: string, items: readonly ShelfItemRow[], substitutions: readonly ShelfSubstitutionRow[]): ShelfStep[] {
  const replacement = new Map(substitutions.filter((s) => s.version_id === versionId).map((s) => [s.original_content_id, s.replacement_content_id]));
  const sorted = items
    .filter((item) => item.version_id === versionId)
    .sort((a, b) => a.position - b.position || a.content_id.localeCompare(b.content_id))
    .map((item) => {
      const replaced = replacement.get(item.content_id);
      return {
        contentId: replaced ?? item.content_id,
        originalContentId: item.content_id,
        position: item.position,
        section: item.section,
        isRequired: item.is_required,
        substituted: replaced !== undefined,
      };
    });
  const groups = new Map<string, ShelfStep[]>();
  for (const step of sorted) {
    const key = step.section ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(step);
  }
  return [...groups.values()].flat();
}

/** O mínimo do conteúdo que o estado precisa. */
export type ShelfStepContent = { access_level: AccessLevel | null; required_module_id: string | null };

export type ShelfStepState = "done" | "locked" | "unavailable" | "open";

type StateInput = {
  step: Pick<ShelfStep, "contentId" | "originalContentId">;
  /** null = a RLS escondeu o conteúdo (arquivado, agendado, rascunho). */
  content: ShelfStepContent | null;
  /** Concluída só aparece para quem está inscrito (ativo ou concluído). */
  enrolled: boolean;
  completedIds: ReadonlySet<string>;
  /** Módulos liberados para a pessoa (my_entitled_modules); vazio para visitante. */
  entitledModules: ReadonlySet<string>;
};

/**
 * Estado do quadrado. Ordem: concluída > indisponível > bloqueada > aberta. Concluída vem primeiro
 * porque a conclusão vale pelo id, esteja o conteúdo no ar ou não (como a página do programa e
 * check_program_completion): sem isso o "n de m" do inscrito perderia uma etapa já feita.
 * O cadeado segue a mesma regra da página do programa (premium sem o módulo); para visitante, todo
 * premium tem cadeado — o mesmo que o quadro público do Explorar já mostra, nada além.
 */
export function shelfStepState({ step, content, enrolled, completedIds, entitledModules }: StateInput): ShelfStepState {
  if (enrolled && (completedIds.has(step.contentId) || completedIds.has(step.originalContentId))) return "done";
  if (!content || content.access_level === null) return "unavailable";
  if (content.access_level === "premium" && !(content.required_module_id && entitledModules.has(content.required_module_id))) return "locked";
  return "open";
}

export type ShelfSectionKind = "essential" | "beyond" | "custom";

/** As seções do seed são texto em português; viram rótulos traduzidos. Outros textos passam como estão. */
export function shelfSectionKind(section: string | null | undefined): ShelfSectionKind | null {
  const value = section?.trim();
  if (!value) return null;
  const normalized = value.toLocaleLowerCase("pt-BR");
  if (normalized === "essencial") return "essential";
  if (normalized === "para ir além" || normalized === "para ir alem") return "beyond";
  return "custom";
}

/** true onde começa uma seção nova (o rótulo aparece só no primeiro quadrado de cada seção). */
export function sectionStarts(steps: readonly Pick<ShelfStep, "section">[]): boolean[] {
  return steps.map((step, index) => Boolean(step.section?.trim()) && (index === 0 || (steps[index - 1].section ?? "") !== (step.section ?? "")));
}

/** Progresso "n de m": como na página do programa, contam as obrigatórias (ou todas, se nenhuma for). */
export function shelfProgress(steps: readonly Pick<ShelfStep, "isRequired">[], states: readonly ShelfStepState[]): { done: number; total: number } {
  const required = steps.map((step, index) => ({ step, state: states[index] })).filter(({ step }) => step.isRequired);
  const counted = required.length > 0 ? required : steps.map((step, index) => ({ step, state: states[index] }));
  return { done: counted.filter(({ state }) => state === "done").length, total: counted.length };
}

/** Próxima etapa para "Continuar": a primeira aberta e ainda não concluída (obrigatórias antes). */
export function nextStepIndex(steps: readonly Pick<ShelfStep, "isRequired">[], states: readonly ShelfStepState[]): number {
  const required = states.findIndex((state, index) => state === "open" && steps[index].isRequired);
  return required >= 0 ? required : states.findIndex((state) => state === "open");
}

export type ShelfEnrollment = { program_id: string; version_id: string; status: "active" | "completed" | "abandoned"; enrolled_at: string };

/** Inscrição que vale para a prateleira: ativa > concluída (a mais recente); abandonada não conta. */
export function pickEnrollment(rows: readonly ShelfEnrollment[], programId: string): ShelfEnrollment | null {
  const mine = rows.filter((row) => row.program_id === programId).sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
  return mine.find((row) => row.status === "active") ?? mine.find((row) => row.status === "completed") ?? null;
}

/**
 * Ordem das prateleiras: inscrito em andamento primeiro; depois a ordem de chegada (a consulta já
 * traz destaque e mais recentes primeiro). Estável: empates mantêm a ordem original.
 */
export function orderShelves<T extends { id: string }>(programs: readonly T[], enrollments: readonly ShelfEnrollment[]): T[] {
  const active = new Set(programs.filter((program) => pickEnrollment(enrollments, program.id)?.status === "active").map((program) => program.id));
  return [...programs.filter((program) => active.has(program.id)), ...programs.filter((program) => !active.has(program.id))];
}

/** Partes já traduzidas do nome acessível do quadrado. */
type StepNameParts = {
  /** "Etapa 2 de 6: Título" */
  position: string;
  /** "concluída", "requer plano Base", "indisponível"; omitido quando aberta. */
  state?: string | null;
};

/** Nome acessível do quadrado: "Etapa 2 de 6: Título, concluída". */
export function stepAccessibleName({ position, state }: StepNameParts): string {
  return [position.trim(), state?.trim()].filter(Boolean).join(", ");
}

/** Meta curta do cabeçalho ("6 etapas · 2 semanas · 2 de 6 concluídas"), sem partes vazias. */
export function joinMeta(parts: ReadonlyArray<string | null | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" · ");
}
