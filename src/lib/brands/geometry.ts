// Smart Tags (0062): posição da marcação em % da FOTO (não do quadro). Funções puras para levar o
// ponto da foto para o quadro renderizado (object-cover corta, object-contain sobra borda) e de volta
// (clique do admin no editor). Testadas em tests/unit/brands.test.ts.

export type Size = { width: number; height: number };
export type ImageFit = "cover" | "contain";
/** Caixa da foto dentro do quadro, em px (left/top podem ser negativos no cover). */
export type Box = { left: number; top: number; width: number; height: number };

/** Caixa onde a foto é desenhada dentro do quadro, como o object-fit do CSS (centralizada). */
export function renderedImageBox(frame: Size, image: Size, fit: ImageFit): Box {
  if (frame.width <= 0 || frame.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { left: 0, top: 0, width: Math.max(0, frame.width), height: Math.max(0, frame.height) };
  }
  const scaleX = frame.width / image.width;
  const scaleY = frame.height / image.height;
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = image.width * scale;
  const height = image.height * scale;
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height };
}

export type FramePoint = { leftPct: number; topPct: number; visible: boolean };

/**
 * Ponto da foto (x, y em % da foto) → posição em % do quadro, para o CSS (left/top em %). Sem o
 * tamanho real da foto (ainda carregando), assume que a foto ocupa o quadro inteiro. No cover, o
 * ponto que caiu na parte cortada fica invisível.
 */
export function tagFramePosition(point: { x: number; y: number }, frame: Size, image: Size | null, fit: ImageFit): FramePoint {
  const x = clampPct(point.x);
  const y = clampPct(point.y);
  if (!image || frame.width <= 0 || frame.height <= 0) return { leftPct: x, topPct: y, visible: true };
  const box = renderedImageBox(frame, image, fit);
  const px = box.left + (x / 100) * box.width;
  const py = box.top + (y / 100) * box.height;
  // meio pixel de folga para arredondamento
  const visible = px >= -0.5 && py >= -0.5 && px <= frame.width + 0.5 && py <= frame.height + 0.5;
  return { leftPct: round2((px / frame.width) * 100), topPct: round2((py / frame.height) * 100), visible };
}

/** Clique no quadro (px relativos ao quadro) → ponto em % da foto; null se caiu fora da foto (sobra do contain). */
export function framePointToImagePct(click: { x: number; y: number }, frame: Size, image: Size | null, fit: ImageFit): { x: number; y: number } | null {
  if (frame.width <= 0 || frame.height <= 0) return null;
  const box = image ? renderedImageBox(frame, image, fit) : { left: 0, top: 0, width: frame.width, height: frame.height };
  if (box.width <= 0 || box.height <= 0) return null;
  const x = ((click.x - box.left) / box.width) * 100;
  const y = ((click.y - box.top) / box.height) * 100;
  if (x < -0.5 || y < -0.5 || x > 100.5 || y > 100.5) return null;
  return { x: round2(clampPct(x)), y: round2(clampPct(y)) };
}

export type LabelSide = "left" | "right" | "top" | "bottom";
export const LABEL_SIDES: readonly LabelSide[] = ["left", "right", "top", "bottom"];

export function isLabelSide(value: unknown): value is LabelSide {
  return typeof value === "string" && (LABEL_SIDES as readonly string[]).includes(value);
}

/**
 * Lado do rótulo que cabe no quadro: o escolhido pelo admin, a não ser que o ponto esteja colado na
 * borda daquele lado (aí vira para o lado oposto). edge = % do quadro reservado para o rótulo.
 */
export function fitLabelSide(side: LabelSide, pos: { leftPct: number; topPct: number }, edge = 28): LabelSide {
  if (side === "right" && pos.leftPct > 100 - edge) return "left";
  if (side === "left" && pos.leftPct < edge) return "right";
  if (side === "top" && pos.topPct < edge * 0.6) return "bottom";
  if (side === "bottom" && pos.topPct > 100 - edge * 0.6) return "top";
  return side;
}

/** Lado sugerido para uma marcação nova: para dentro da foto. */
export function suggestLabelSide(point: { x: number; y: number }): LabelSide {
  return point.x > 55 ? "left" : "right";
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
