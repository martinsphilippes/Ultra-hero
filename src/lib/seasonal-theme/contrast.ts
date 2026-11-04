// Contraste WCAG 2.1 (módulo puro, testado). O tema sazonal é validado contra as paletas dos 5 templates de Aparência
// (claro e escuro), porque cada pessoa pode estar em qualquer um: o tema não pode estragar a leitura em nenhum.
import type { ColorMode, ModeTokens, ThemeBackground } from "./vocab";
import { isHexColor } from "./vocab";

export const AA_TEXT = 4.5;
export const AA_UI = 3;

/** Cores de base dos templates (templates.css / globals.css). Manter em dia se um template mudar. */
export type TemplatePalette = { template: string; bg: string; surface: string; fg: string; fgMuted: string };
export const TEMPLATE_PALETTES: Record<ColorMode, TemplatePalette[]> = {
  light: [
    { template: "original", bg: "#f7f4ef", surface: "#ffffff", fg: "#141414", fgMuted: "#5f5a54" },
    { template: "impact", bg: "#ffffff", surface: "#f5f5f5", fg: "#111111", fgMuted: "#555555" },
    { template: "essential", bg: "#f5f1ea", surface: "#fffdf9", fg: "#2a2420", fgMuted: "#62574f" },
    { template: "performance", bg: "#eef0f3", surface: "#ffffff", fg: "#0f141a", fgMuted: "#4b5563" },
    { template: "urban", bg: "#ededed", surface: "#ffffff", fg: "#0a0a0a", fgMuted: "#474747" },
  ],
  dark: [
    { template: "original", bg: "#0b0b0b", surface: "#141414", fg: "#f2efea", fgMuted: "#a7a199" },
    { template: "impact", bg: "#0a0a0a", surface: "#171717", fg: "#ffffff", fgMuted: "#b8b8b8" },
    { template: "essential", bg: "#1b1816", surface: "#242020", fg: "#f3ebe2", fgMuted: "#c4b8ac" },
    { template: "performance", bg: "#0b0e12", surface: "#12161c", fg: "#eef2f6", fgMuted: "#a6b0bd" },
    { template: "urban", bg: "#000000", surface: "#131313", fg: "#f5f5f5", fgMuted: "#b5b5b5" },
  ],
};

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Texto sobre a cor de acento (botão principal): preto ou branco, o que contrastar mais (sempre ≥ 4,5). */
export function textOn(bg: string): string {
  return contrastRatio(bg, "#0b0b0b") >= contrastRatio(bg, "#ffffff") ? "#0b0b0b" : "#ffffff";
}

/** Mistura a cor com outra (t = 0 → a própria; 1 → a outra). */
export function mix(hex: string, other: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/**
 * A cor mais próxima de `color` que tenha contraste ≥ `min` contra TODOS os fundos: escurece (claro) ou clareia
 * (escuro) aos poucos. Devolve a própria cor quando já passa.
 */
export function ensureContrast(color: string, backgrounds: readonly string[], mode: ColorMode, min = AA_TEXT): string {
  const target = mode === "light" ? "#000000" : "#ffffff";
  for (let i = 0; i <= 20; i++) {
    const c = i === 0 ? color : mix(color, target, i / 20);
    if (backgrounds.every((bg) => contrastRatio(c, bg) >= min)) return c;
  }
  return target;
}

export type ContrastIssue =
  | { kind: "bg_text"; mode: ColorMode; template: string; ratio: number } // texto do template sobre o fundo do tema
  | { kind: "surface_text"; mode: ColorMode; template: string; ratio: number } // texto sobre a superfície do tema
  | { kind: "accent_ui"; mode: ColorMode; template: string; ratio: number } // acento (borda, ícone, botão) sobre o fundo
  | { kind: "accent_text_adjusted"; mode: ColorMode; from: string; to: string } // texto em acento ajustado sozinho
  | { kind: "accent_soft_text"; mode: ColorMode; ratio: number } // acento suave claro/escuro demais
  | { kind: "background_hidden"; mode: ColorMode; template: string; ratio: number } // degradê reprovado: não aparece nesse modo
  | { kind: "background_image"; mode: ColorMode }; // imagem: o contraste depende do desenho (conferir na prévia)

export type ModeReport = {
  mode: ColorMode;
  /** Bloqueia publicar: texto do app ilegível sobre fundo/superfície do tema em algum template. */
  errors: ContrastIssue[];
  /** Avisos: o tema publica, com ajuste automático ou só alerta. */
  warnings: ContrastIssue[];
  accentFg: string | null;
  accentText: string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Fundos sobre os quais o texto em cor de acento aparece (fundo e superfície do tema ou de cada template). */
export function textBackgrounds(tokens: ModeTokens, mode: ColorMode): string[] {
  const out = new Set<string>();
  for (const p of TEMPLATE_PALETTES[mode]) {
    out.add(tokens.bg ?? p.bg);
    out.add(tokens.surface ?? p.surface);
  }
  if (tokens.accentSoft) out.add(tokens.accentSoft);
  return [...out];
}

/** Valida as cores de um modo contra os 5 templates. Cores inválidas são ignoradas (o zod/banco já barram). */
export function checkModeTokens(tokens: ModeTokens | undefined, mode: ColorMode): ModeReport {
  const t: ModeTokens = {};
  for (const [k, v] of Object.entries(tokens ?? {})) if (isHexColor(v)) t[k as keyof ModeTokens] = v;
  const errors: ContrastIssue[] = [];
  const warnings: ContrastIssue[] = [];
  for (const p of TEMPLATE_PALETTES[mode]) {
    if (t.bg) {
      const ratio = Math.min(contrastRatio(p.fg, t.bg), contrastRatio(p.fgMuted, t.bg));
      if (ratio < AA_TEXT) errors.push({ kind: "bg_text", mode, template: p.template, ratio: round(ratio) });
    }
    if (t.surface) {
      const ratio = Math.min(contrastRatio(p.fg, t.surface), contrastRatio(p.fgMuted, t.surface));
      if (ratio < AA_TEXT) errors.push({ kind: "surface_text", mode, template: p.template, ratio: round(ratio) });
    }
    if (t.accent) {
      const ratio = contrastRatio(t.accent, t.bg ?? p.bg);
      if (ratio < AA_UI) warnings.push({ kind: "accent_ui", mode, template: p.template, ratio: round(ratio) });
    }
  }
  let accentText: string | null = null;
  let accentFg: string | null = null;
  if (t.accent) {
    accentFg = textOn(t.accent);
    accentText = ensureContrast(t.accent, textBackgrounds(t, mode), mode);
    if (accentText !== t.accent) warnings.push({ kind: "accent_text_adjusted", mode, from: t.accent, to: accentText });
  }
  if (t.accentSoft && !t.accent) {
    // acento suave sem acento: o texto do template em acento fica por cima dele
    const worst = Math.min(...TEMPLATE_PALETTES[mode].map((p) => contrastRatio(p.fg, t.accentSoft!)));
    if (worst < AA_TEXT) warnings.push({ kind: "accent_soft_text", mode, ratio: round(worst) });
  }
  return { mode, errors, warnings, accentFg, accentText };
}

export function checkTokens(tokens: { light?: ModeTokens; dark?: ModeTokens }): { light: ModeReport; dark: ModeReport; ok: boolean } {
  const light = checkModeTokens(tokens.light, "light");
  const dark = checkModeTokens(tokens.dark, "dark");
  return { light, dark, ok: light.errors.length === 0 && dark.errors.length === 0 };
}

/**
 * Fundo decorativo × texto que fica direto sobre o fundo (títulos, descrições). O degradê é misturado ao fundo de cada
 * template na intensidade escolhida; se o texto (fg e fg-muted) cair abaixo de 4,5 em algum template, o fundo NÃO
 * aparece naquele modo (ajuste automático, com aviso). Imagem: não dá para medir; a intensidade é limitada a 40%.
 */
export function checkBackground(bg: ThemeBackground | null | undefined, tokens: { light?: ModeTokens; dark?: ModeTokens }): { hiddenIn: ColorMode[]; warnings: ContrastIssue[] } {
  const hiddenIn: ColorMode[] = [];
  const warnings: ContrastIssue[] = [];
  if (!bg || bg.type === "none") return { hiddenIn, warnings };
  for (const mode of ["light", "dark"] as const) {
    if (bg.type === "image") {
      warnings.push({ kind: "background_image", mode });
      continue;
    }
    if (!isHexColor(bg.from) || !isHexColor(bg.to)) continue;
    const t = Math.min(40, Math.max(5, bg.intensity)) / 100;
    for (const p of TEMPLATE_PALETTES[mode]) {
      const base = isHexColor(tokens[mode]?.bg) ? tokens[mode]!.bg! : p.bg;
      const ratio = Math.min(...[bg.from, bg.to].flatMap((stop) => [contrastRatio(p.fg, mix(base, stop, t)), contrastRatio(p.fgMuted, mix(base, stop, t))]));
      if (ratio < AA_TEXT) {
        hiddenIn.push(mode);
        warnings.push({ kind: "background_hidden", mode, template: p.template, ratio: round(ratio) });
        break;
      }
    }
  }
  return { hiddenIn, warnings };
}
