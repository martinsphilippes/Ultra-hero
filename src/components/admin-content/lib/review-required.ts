// Regra "Exigir revisão" por tipo (P1). Só a receita tem "Enviar para revisão" no portal do herói
// (RecipeWizard); o composer de post e o editor antigo só publicam direto. Ligar a regra para outro
// tipo travaria a publicação do herói sem caminho para sair, então a tela só deixa ligar para
// receita. Tipo que já está ligado (pela RPC, antes desta tela) ainda pode ser desligado.
export const REVIEW_FLOW_TYPES = ["recipe"] as const;

export type ReviewToggle = "toggle" | "offOnly" | "locked";

export function hasReviewFlow(type: string): boolean {
  return (REVIEW_FLOW_TYPES as readonly string[]).includes(type);
}

export function reviewToggle(type: string, on: boolean): ReviewToggle {
  if (hasReviewFlow(type)) return "toggle";
  return on ? "offOnly" : "locked";
}

/** A mudança pedida é permitida? (ligar só onde há fluxo; desligar sempre) */
export function reviewChangeAllowed(type: string, on: boolean): boolean {
  return !on || hasReviewFlow(type);
}
