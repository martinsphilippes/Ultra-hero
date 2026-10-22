// "Produtos relacionados" de um conteúdo: só vínculo validado. Fora das receitas, mostra só o que
// pode ir ao carrinho (product_is_purchasable); nas receitas (fase 5) o indisponível continua na
// tela, marcado, para a pessoa saber que o kit existe (seção 4.4: indisponível não some).
export type RelatedProductEntry<P> = { product: P; unavailable: boolean };

export function relatedProductsToShow<P>(candidates: P[], purchasable: boolean[], showUnavailable: boolean): RelatedProductEntry<P>[] {
  return candidates
    .map((product, index) => ({ product, unavailable: !purchasable[index] }))
    .filter((entry) => showUnavailable || !entry.unavailable)
    // os disponíveis primeiro, mantendo a ordem do vínculo
    .sort((a, b) => Number(a.unavailable) - Number(b.unavailable));
}
