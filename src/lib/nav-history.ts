// Histórico de navegação dentro do app (por aba do navegador). Serve para o "voltar" ir à tela
// anterior quando ela é do próprio app e, quando não há (link aberto de fora, aba nova), cair no
// destino padrão da tela.
export const NAV_DEPTH_KEY = "uh-nav-depth";

export function readNavDepth(): number {
  try {
    return Number(window.sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function bumpNavDepth() {
  try {
    window.sessionStorage.setItem(NAV_DEPTH_KEY, String(readNavDepth() + 1));
  } catch {
    // armazenamento bloqueado: o voltar usa o destino padrão
  }
}

/** Há uma tela anterior do app nesta aba para onde voltar? */
export function canGoBackInApp(): boolean {
  return readNavDepth() > 1 && window.history.length > 1;
}
