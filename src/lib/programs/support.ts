// Programa com produto e profissional ligados (Etapa 4, 0059). Regras puras (sem Supabase/React):
// lista de produtos que o admin salva, o que aparece em "Próximos passos" e no card Apoio, o serviço
// mostrado para cada profissional e a ação de "Começar".
import { nutritionProductsAllowed } from "./program-cards";

export const MAX_PROGRAM_PRODUCTS = 3;
export const PROGRAM_PRODUCT_NOTE_MAX = 200;
export const MAX_PROGRAM_PROFESSIONALS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProgramProductInput = { productId: string; note: string };
export type ProgramProductsError = "too_many_products" | "duplicate_product" | "invalid_input";

/** Confere a lista antes de mandar ao banco (o banco confere de novo): até 3, sem repetir, nota até 200. */
export function normalizeProgramProducts(items: readonly { productId: unknown; note?: unknown }[]): { ok: true; items: ProgramProductInput[] } | { ok: false; error: ProgramProductsError } {
  if (items.length > MAX_PROGRAM_PRODUCTS) return { ok: false, error: "too_many_products" };
  const seen = new Set<string>();
  const out: ProgramProductInput[] = [];
  for (const item of items) {
    if (typeof item.productId !== "string" || !UUID.test(item.productId)) return { ok: false, error: "invalid_input" };
    const note = typeof item.note === "string" ? item.note.replace(/\s+/g, " ").trim() : "";
    if (note.length > PROGRAM_PRODUCT_NOTE_MAX) return { ok: false, error: "invalid_input" };
    const id = item.productId.toLowerCase();
    if (seen.has(id)) return { ok: false, error: "duplicate_product" };
    seen.add(id);
    out.push({ productId: id, note });
  }
  return { ok: true, items: out };
}

export type SupportScreenKey = "products" | "professionals";

export type SupportPlan = {
  /** "Comprar produto": só com o comércio ligado e fora do app das lojas. */
  showProducts: boolean;
  /** Profissionais aparecem sempre que houver; no app das lojas sem "Contratar" (só o perfil). */
  showProfessionals: boolean;
  /** Mostra a faixa "Próximos passos" (Começar + o que estiver ligado). */
  showActions: boolean;
  /** Telas do card Apoio, na ordem (vazio = card escondido). */
  apoioScreens: SupportScreenKey[];
};

export function supportPlan({ products, professionals, commerceEnabled, nativeApp }: { products: number; professionals: number; commerceEnabled: boolean; nativeApp: boolean }): SupportPlan {
  const showProducts = products > 0 && nutritionProductsAllowed({ commerceEnabled, nativeApp });
  const showProfessionals = professionals > 0;
  const apoioScreens: SupportScreenKey[] = [];
  if (showProducts) apoioScreens.push("products");
  if (showProfessionals) apoioScreens.push("professionals");
  return { showProducts, showProfessionals, showActions: showProducts || showProfessionals, apoioScreens };
}

/** Serviço mostrado para o profissional: o escolhido pelo admin (se ainda ativo), senão o 1º ativo. */
export function pickProgramService<T extends { id: string }>(services: readonly T[], preferredId: string | null | undefined): T | null {
  if (preferredId) {
    const chosen = services.find((s) => s.id === preferredId);
    if (chosen) return chosen;
  }
  return services[0] ?? null;
}

export type StartAction = "login" | "enroll" | "reenroll" | "continue" | "review";

/** O que o passo "Começar" oferece: entrar, participar (de novo), continuar ou rever. */
export function startAction({ loggedIn, enrollment }: { loggedIn: boolean; enrollment: "active" | "completed" | "abandoned" | null }): StartAction {
  if (!loggedIn) return "login";
  if (enrollment === "active") return "continue";
  if (enrollment === "completed") return "review";
  return enrollment === "abandoned" ? "reenroll" : "enroll";
}

/** Próximo conteúdo para "Continuar": o 1º obrigatório pendente, senão o 1º pendente. */
export function nextPendingSlug(items: readonly { slug: string | null; required: boolean; done: boolean }[]): string | null {
  const open = items.filter((i) => i.slug && !i.done);
  return (open.find((i) => i.required) ?? open[0])?.slug ?? null;
}
