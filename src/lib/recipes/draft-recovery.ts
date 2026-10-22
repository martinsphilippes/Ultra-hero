// Cópia local do rascunho do editor (localStorage), para nada se perder se a rede cair, a aba fechar
// ou o servidor recusar. Regras puras; o acesso ao localStorage fica no componente, com try/catch.
import { isRecipeDraft, sameDraft, type RecipeDraft } from "./draft";

export const DRAFT_STORAGE_VERSION = 1;

/**
 * Chave da cópia local, separada por herói: num aparelho compartilhado (ou na troca de conta demo)
 * a receita nova de um herói não aparece como "Recuperar" para outro.
 */
export function draftStorageKey(creatorId: string, contentId: string): string {
  return `uh-recipe-draft:${creatorId}:${contentId}`;
}

export type StoredDraft = {
  v: typeof DRAFT_STORAGE_VERSION;
  /** Quando a cópia foi gravada no aparelho (ms). */
  savedAt: number;
  /** updated_at do servidor que a edição tomou por base. */
  baseUpdatedAt: string;
  draft: RecipeDraft;
};

export function serializeDraft(draft: RecipeDraft, baseUpdatedAt: string, now: number = Date.now()): string {
  const stored: StoredDraft = { v: DRAFT_STORAGE_VERSION, savedAt: now, baseUpdatedAt, draft };
  return JSON.stringify(stored);
}

/** Lê a cópia local; qualquer coisa fora do formato (versão antiga, JSON quebrado) é ignorada. */
export function parseStoredDraft(raw: string | null | undefined): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    if (value?.v !== DRAFT_STORAGE_VERSION || typeof value.savedAt !== "number" || typeof value.baseUpdatedAt !== "string") return null;
    if (!isRecipeDraft(value.draft)) return null;
    // cópia gravada antes do campo allergensSome: deduz do que foi declarado
    const draft = value.draft;
    if (typeof draft.allergensSome !== "boolean") draft.allergensSome = draft.allergensDeclared && draft.allergens.length > 0;
    return value as StoredDraft;
  } catch {
    return null;
  }
}

/**
 * Oferece "Recuperar | Descartar" quando a cópia local é mais nova que a gravação do servidor e
 * difere do que o servidor tem. Cópia mais velha (o servidor recebeu algo depois, por exemplo de
 * outro aparelho) não é oferecida: sobrescreveria trabalho mais recente.
 */
export function shouldOfferRecovery(stored: StoredDraft | null, serverUpdatedAt: string, serverDraft: RecipeDraft): boolean {
  if (!stored) return false;
  if (sameDraft(stored.draft, serverDraft)) return false;
  // editada sobre a versão que o servidor ainda tem: é mais nova, seja qual for o relógio do aparelho
  if (stored.baseUpdatedAt === serverUpdatedAt) return true;
  const server = Date.parse(serverUpdatedAt);
  return !Number.isFinite(server) || stored.savedAt > server;
}
