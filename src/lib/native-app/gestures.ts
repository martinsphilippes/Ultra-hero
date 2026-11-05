// Gestos do app das lojas (regras puras, testadas em tests/unit/native-gestures.test.ts): puxar para atualizar e
// arrastar de lado entre as abas. Quem escuta o toque é components/native-app/NativeGestures.tsx.

/** Distância puxada, com resistência, que dispara a atualização. */
export const PULL_TRIGGER = 64;
/** Altura em que o indicador fica enquanto atualiza. */
export const PULL_REST = 48;
const PULL_MAX = 96;
const PULL_RESISTANCE = 0.5;

/** Até onde a página desce para um arrasto de `dy` pixels. */
export function pullDistance(dy: number): number {
  return Math.min(PULL_MAX, Math.max(0, dy * PULL_RESISTANCE));
}

/** Margem das bordas: o arrasto que nasce nelas é o voltar/avançar do sistema, não a troca de aba. */
export const SWIPE_EDGE = 24;
const SWIPE_MIN = 64;
const SWIPE_RATIO = 1.8;

/** Arrasto claramente horizontal e longo o bastante para trocar de aba. */
export function isTabSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) >= Math.abs(dy) * SWIPE_RATIO;
}

/** Aba vizinha: arrastar para a esquerda (dx < 0) vai à próxima. Só vale na raiz de uma aba; nas pontas, null. */
export function adjacentTab(pathname: string, dx: number, tabs: readonly string[]): string | null {
  const index = tabs.indexOf(pathname);
  if (index === -1) return null;
  return tabs[index + (dx < 0 ? 1 : -1)] ?? null;
}
