// "Próximo negócio" sugerido no fim do clipping (0110, D11): regra simples sobre o serviço que acabou e os números
// das entregas. Puro e testável; a agência decide (o botão só abre o formulário de negócio novo).

export type NextDealInput = {
  serviceSlug: string | null;
  talent: string | null;
  brand: string | null;
  engagementRate: number | null;
  published: number;
};

export type NextDealSuggestion = {
  /** slug do serviço sugerido no catálogo padrão Groscove (0107) */
  service: string;
  /** motivo (chave de tradução em projectRoom.nextDeal.reasons) */
  reason: "content_to_publi" | "publi_to_live" | "publi_repeat" | "press_continue" | "artistic_continue" | "mentoring_to_plan" | "plan_to_artistic" | "default";
  /** engajamento alto (≥ 3%) reforça o texto */
  strong: boolean;
};

const PRODUCTION = new Set(["producao-de-video", "producao-fotografica", "live-session"]);

export function suggestNextDeal(input: NextDealInput): NextDealSuggestion {
  const strong = (input.engagementRate ?? 0) >= 3;
  const slug = input.serviceSlug ?? "";
  if (PRODUCTION.has(slug)) return { service: "publipost", reason: "content_to_publi", strong };
  if (slug === "publipost") return strong || input.published > 1 ? { service: "live-session", reason: "publi_to_live", strong } : { service: "publipost", reason: "publi_repeat", strong };
  if (slug === "assessoria-de-imprensa") return { service: "assessoria-de-imprensa", reason: "press_continue", strong };
  if (slug === "assessoria-artistica") return { service: "assessoria-artistica", reason: "artistic_continue", strong };
  if (slug === "mentoria-jonathas") return { service: "business-plan", reason: "mentoring_to_plan", strong };
  if (slug === "business-plan") return { service: "assessoria-artistica", reason: "plan_to_artistic", strong };
  return { service: "publipost", reason: "default", strong };
}
