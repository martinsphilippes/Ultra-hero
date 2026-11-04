// CSS do tema sazonal (módulo puro, testado): só a lista fechada de variáveis --uh-*, com valores já validados
// (#rrggbb). Nada de CSS livre vindo do banco. Texto sobre o acento e texto em acento saem calculados (AA).
import { checkBackground, checkModeTokens, mix } from "./contrast";
import type { ColorMode, ModeTokens, ThemeBackground, ThemeTokens } from "./vocab";
import { isAssetUrl, isHexColor } from "./vocab";

/** Variáveis de um modo (claro/escuro). Vazio quando o tema não mexe nas cores desse modo. */
export function modeVars(tokens: ModeTokens | undefined, mode: ColorMode): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!tokens) return vars;
  const report = checkModeTokens(tokens, mode);
  if (isHexColor(tokens.accent)) {
    vars["--uh-accent"] = tokens.accent;
    vars["--uh-accent-hover"] = mix(tokens.accent, mode === "light" ? "#000000" : "#ffffff", 0.12);
    vars["--uh-accent-fg"] = report.accentFg ?? "#0b0b0b";
    vars["--uh-accent-text"] = report.accentText ?? tokens.accent;
    vars["--uh-accent-soft"] = isHexColor(tokens.accentSoft) ? tokens.accentSoft : `color-mix(in srgb, ${tokens.accent} ${mode === "light" ? 16 : 14}%, transparent)`;
    vars["--uh-focus"] = report.accentText ?? tokens.accent;
  } else if (isHexColor(tokens.accentSoft)) {
    vars["--uh-accent-soft"] = tokens.accentSoft;
  }
  // fundo/superfície só entram se passarem no AA contra o texto de todos os templates (senão o tema fica sem eles)
  const blocked = new Set(report.errors.map((e) => e.kind));
  if (isHexColor(tokens.bg) && !blocked.has("bg_text")) vars["--uh-bg"] = tokens.bg;
  if (isHexColor(tokens.surface) && !blocked.has("surface_text")) {
    vars["--uh-surface"] = tokens.surface;
    vars["--uh-surface-elevated"] = tokens.surface;
  }
  return vars;
}

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return body ? `${selector}{${body}}` : "";
}

/**
 * Folha do tema para o documento. `:root:root:root[data-theme=…]` vence os seletores dos templates
 * ([data-template][data-theme], especificidade 0-2-0) sem !important; as prévias do painel Aparência (contêiner com
 * data-template) continuam mostrando o template puro.
 */
export function buildSeasonCss(tokens: ThemeTokens, animations: boolean, background?: ThemeBackground | null): string {
  const parts = [
    block(':root:root:root[data-theme="light"]', modeVars(tokens.light, "light")),
    block(':root:root:root[data-theme="dark"]', modeVars(tokens.dark, "dark")),
  ];
  // degradê que derruba o contraste do texto num modo não aparece nesse modo
  for (const mode of checkBackground(background, tokens).hiddenIn) parts.push(`:root[data-theme="${mode}"] .uh-season-bg{display:none}`);
  if (animations) {
    // só com "sem preferência de movimento"; o reset global de reduce também zera
    parts.push(
      "@media (prefers-reduced-motion:no-preference){.uh-season-decor{animation:uh-season-float 6s ease-in-out infinite alternate}.uh-season-decor:nth-child(2n){animation-delay:-3s}}",
      "@keyframes uh-season-float{from{transform:translateY(0)}to{transform:translateY(-6px)}}",
    );
  }
  return parts.filter(Boolean).join("\n");
}

/** Estilo da camada de fundo (atrás de todo o conteúdo). null = sem camada. */
export function backgroundLayerStyle(bg: ThemeBackground | null | undefined): Record<string, string> | null {
  if (!bg || bg.type === "none") return null;
  const opacity = String(Math.min(40, Math.max(5, bg.intensity)) / 100);
  if (bg.type === "gradient") {
    if (!isHexColor(bg.from) || !isHexColor(bg.to)) return null;
    const angle = Math.min(360, Math.max(0, Math.round(bg.angle)));
    return { backgroundImage: `linear-gradient(${angle}deg, ${bg.from}, ${bg.to})`, opacity };
  }
  if (!isAssetUrl(bg.url)) return null;
  return bg.fit === "repeat"
    ? { backgroundImage: `url("${bg.url}")`, backgroundRepeat: "repeat", backgroundSize: "240px auto", opacity }
    : { opacity };
}
