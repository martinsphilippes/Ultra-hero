// Atleta da abertura: boneco articulado ORIGINAL (cabeça, tronco e membros afunilados) animado só com
// rotações CSS nas articulações. Cada pose-chave abaixo vira um passo de @keyframes; o navegador
// interpola entre elas (corrida → passada de impulsão → salto com os braços ao alto → funde no triângulo da marca).

import { INTRO_DURATION_MS } from "./script";

/** Articulações animadas (graus; positivo = horário na tela). N = membro de perto, F = de longe. */
export const JOINTS = ["torso", "hipN", "kneeN", "ankleN", "hipF", "kneeF", "ankleF", "shN", "elN", "shF", "elF"] as const;
export type Joint = (typeof JOINTS)[number];

export type Pose = {
  /** Instante em segundos desde o início da abertura. */
  t: number;
  /** Posição do quadril no palco (viewBox 360×480), escala e opacidade do corpo. */
  x: number;
  y: number;
  s?: number;
  o?: number;
} & Record<Joint, number>;

// Convenções: tronco + inclina para a frente; quadril/ombro − leva o membro à frente;
// joelho + flexiona (canela para trás); cotovelo − flexiona (antebraço para a frente).
// Passada: coxa da frente alta, canela solta; perna de trás estendida empurrando; braços em 90°.
const strideA = { torso: 18, hipN: -68, kneeN: 84, ankleN: -8, hipF: 40, kneeF: 22, ankleF: 36, shN: 56, elN: -96, shF: -62, elF: -96 };
const strideB = { torso: 18, hipN: 40, kneeN: 22, ankleN: 36, hipF: -68, kneeF: 84, ankleF: -8, shN: -62, elN: -96, shF: 56, elF: -96 };
// Apoio (pernas se cruzando): uma perna sob o corpo, o calcanhar da outra sobe atrás.
const passA = { torso: 16, hipN: 8, kneeN: 24, ankleN: 6, hipF: -28, kneeF: 124, ankleF: 34, shN: 6, elN: -92, shF: -4, elF: -92 };
const passB = { torso: 16, hipN: -28, kneeN: 124, ankleN: 34, hipF: 8, kneeF: 24, ankleF: 6, shN: -4, elN: -92, shF: 6, elF: -92 };
// Voo de herói: corpo na diagonal rumo ao triângulo da marca, braços estendidos à frente, pernas unidas atrás.
const flight = { torso: 30, hipN: 34, kneeN: 10, ankleN: 40, hipF: 44, kneeF: 22, ankleF: 44, shN: -176, elN: 0, shF: -162, elF: -6 };

export const POSES: Pose[] = [
  // fora de cena durante a marca; entra pela esquerda já correndo
  { t: 0, x: -70, y: 336, o: 0, ...strideA },
  { t: 0.74, x: -66, y: 336, o: 0, ...strideA },
  { t: 0.8, x: -46, y: 336, o: 1, ...strideA },
  { t: 0.926, x: -6, y: 342, ...passA },
  { t: 1.052, x: 34, y: 334, ...strideB },
  { t: 1.178, x: 72, y: 342, ...passB },
  // penúltima passada: mais baixa, braços atrás carregando o impulso
  { t: 1.304, x: 100, y: 348, torso: 10, hipN: -50, kneeN: 46, ankleN: -6, hipF: 30, kneeF: 70, ankleF: 24, shN: 52, elN: -40, shF: 44, elF: -44 },
  // impulsão na perna de longe; o joelho de perto sobe e os braços varrem para cima
  { t: 1.43, x: 98, y: 322, torso: 12, hipN: -96, kneeN: 92, ankleN: 8, hipF: 32, kneeF: 4, ankleF: 42, shN: -132, elN: -30, shF: -110, elF: -40 },
  { t: 1.574, x: 106, y: 268, torso: 24, hipN: -30, kneeN: 40, ankleN: 24, hipF: 36, kneeF: 30, ankleF: 40, shN: -168, elN: -8, shF: -150, elF: -14 },
  // as mãos alcançam o triângulo
  { t: 1.736, x: 112, y: 246, ...flight },
  // mergulha no triângulo: encolhe e some enquanto a marca acende
  { t: 1.88, x: 156, y: 176, s: 0.55, o: 1, ...flight },
  { t: 2.006, x: 180, y: 128, s: 0.06, o: 0, ...flight },
  { t: INTRO_DURATION_MS / 1000, x: 180, y: 128, s: 0.06, o: 0, ...flight },
];

const pct = (t: number) => `${+((t / (INTRO_DURATION_MS / 1000)) * 100).toFixed(2)}%`;

/** Gera os @keyframes do corpo (deslocamento) e de cada articulação a partir das poses-chave. */
export function buildIntroKeyframes(poses: Pose[] = POSES): string {
  const body = poses
    .map((p) => `${pct(p.t)}{transform:translate(${p.x}px,${p.y}px) scale(${p.s ?? 1});opacity:${p.o ?? 1}}`)
    .join("");
  const joints = JOINTS.map(
    (j) => `@keyframes uh-j-${j}{${poses.map((p) => `${pct(p.t)}{transform:rotate(${p[j]}deg)}`).join("")}}.uh-j-${j}{animation-name:uh-j-${j}}`,
  ).join("");
  // sombra no chão: acompanha o x e encolhe/clareia conforme o corpo sobe
  const shadow = poses
    .map((p) => {
      const k = Math.max(0.15, Math.min(1, 1 - (340 - p.y) / 150));
      return `${pct(p.t)}{transform:translate(${p.x}px,432px) scale(${+k.toFixed(2)});opacity:${+((p.o ?? 1) * k * 0.35).toFixed(2)}}`;
    })
    .join("");
  return `@keyframes uh-fig-body{${body}}@keyframes uh-fig-shadow{${shadow}}${joints}`;
}

// Forma afunilada de um segmento (cápsula de largura w1 no topo e w2 na ponta), de (0,0) a (0,len).
export function limbPath(len: number, w1: number, w2: number): string {
  const a = w1 / 2;
  const b = w2 / 2;
  return `M${-a} 0L${-b} ${len}A${b} ${b} 0 0 0 ${b} ${len}L${a} 0A${a} ${a} 0 0 0 ${-a} 0Z`;
}
