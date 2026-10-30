// Programa do herói só tem etapas do próprio herói (0052). Regra pura, espelho do gatilho do banco
// (program_items_owner_guard): o app valida antes de gravar e o banco garante.

/** Código de erro do banco e do app (traduzido em adminContent.errors). */
export const PROGRAM_ITEM_FOREIGN_CONTENT = "program_item_foreign_content";

/**
 * O conteúdo pode entrar no programa? Programa sem herói (editorial) aceita qualquer conteúdo; programa
 * de herói só aceita conteúdo assinado por ele (conteúdo sem autor também fica de fora).
 */
export function canUseInProgram(programCreatorId: string | null | undefined, contentCreatorId: string | null | undefined): boolean {
  if (!programCreatorId) return true;
  return contentCreatorId === programCreatorId;
}

/** Itens (ou conteúdos) que não pertencem ao herói do programa, na ordem recebida. */
export function foreignProgramItems<T extends { creatorId: string | null | undefined }>(programCreatorId: string | null | undefined, items: readonly T[]): T[] {
  return items.filter((item) => !canUseInProgram(programCreatorId, item.creatorId));
}
