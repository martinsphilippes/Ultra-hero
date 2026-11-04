// Layout dinâmico (0100): temas sazonais ligados ao Calendário Groscove. Módulo puro (servidor, cliente e testes).
// O tema é uma CAMADA por cima do template de Aparência: só uma lista fechada de tokens muda (ver css.ts).

export const SEASON_AREAS = ["app", "portals", "institutional"] as const;
export type SeasonArea = (typeof SEASON_AREAS)[number];

export const DECOR_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type DecorPosition = (typeof DECOR_POSITIONS)[number];
export const DECOR_SIZES = ["sm", "md", "lg"] as const;
export type DecorSize = (typeof DECOR_SIZES)[number];
/** Lado em px de cada tamanho de decorativo (quadrado; a imagem cabe dentro, sem cortar). */
export const DECOR_SIZE_PX: Record<DecorSize, number> = { sm: 48, md: 72, lg: 96 };
export const MAX_DECORATIONS = 6;

export const TOKEN_KEYS = ["accent", "accentSoft", "bg", "surface"] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];
export type ModeTokens = Partial<Record<TokenKey, string>>;
export type ThemeTokens = { light?: ModeTokens; dark?: ModeTokens };
export type ColorMode = "light" | "dark";

export type ThemeBackground =
  | { type: "none" }
  | { type: "gradient"; from: string; to: string; angle: number; intensity: number }
  | { type: "image"; url: string; fit: "cover" | "repeat"; intensity: number };

export type Decoration = { url: string; position: DecorPosition; size: DecorSize };
export type LocalizedText = { "pt-BR": string; en?: string; es?: string };
export type ThemeBanner = { text?: LocalizedText; label?: Partial<LocalizedText>; href?: string };

/** O que a leitura pública devolve (grants por coluna da 0100): nada interno. */
export type PublicSeasonTheme = {
  id: string;
  priority: number;
  areas: SeasonArea[];
  tokens: ThemeTokens;
  background: ThemeBackground;
  decorations: Decoration[];
  animations: boolean;
  banner: ThemeBanner;
  windowStart: string;
  windowEnd: string;
};

export const BACKGROUND_INTENSITY = { min: 5, max: 40 } as const;
export const MAX_LEAD_DAYS = 120;
export const PRIORITY_RANGE = { min: 0, max: 1000 } as const;
export const BANNER_TEXT_MAX = 120;
export const BANNER_LABEL_MAX = 40;
/** Envio de imagem (o bucket repete os limites): decorativo até 1 MiB, fundo até 2 MiB. */
export const ASSET_MAX_BYTES = { decoration: 1024 * 1024, background: 2 * 1024 * 1024 } as const;
export const ASSET_BUCKET = "theme-assets";
export const SEASON_CACHE_TAG = "seasonal-themes";
/** Cookie de pré-visualização (só o admin: o servidor confere is_platform_admin ao ler o tema). */
export const SEASON_PREVIEW_COOKIE = "uh-season-preview";

const HEX = /^#[0-9a-f]{6}$/;
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function isSeasonArea(value: unknown): value is SeasonArea {
  return typeof value === "string" && (SEASON_AREAS as readonly string[]).includes(value);
}

/** URL pública aceita para imagem do tema: só o bucket theme-assets, nome <uuid>.(png|jpg|webp). Igual à 0100. */
export const ASSET_URL_RE = /^https?:\/\/[a-z0-9.:-]+\/storage\/v1\/object\/public\/theme-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
export function isAssetUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && ASSET_URL_RE.test(value);
}

/** Link da faixa: caminho interno (/…) ou https. Igual à 0100. */
export function isBannerHref(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && /^(\/[^/\\\s]\S*|\/|https:\/\/[^\s/]+(\/\S*)?)$/.test(value);
}

// Caminhos que NUNCA recebem tema, qualquer que seja o cadastro: compra, carrinho, plano, pagamentos e assinaturas
// (decisão do responsável: checkout/pagamento sem tema). O admin nem monta a camada (layout próprio).
const EXCLUDED_PREFIXES = ["/admin", "/checkout", "/cart", "/profile/plan", "/marca/pagamentos", "/marca/assinaturas", "/agencia/assinaturas", "/heroi/assinaturas"];

export function isSeasonExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Texto localizado com volta ao pt-BR. */
export function localized(text: Partial<LocalizedText> | undefined, locale: string): string {
  if (!text) return "";
  const value = (text as Record<string, string | undefined>)[locale];
  return (value && value.trim()) || text["pt-BR"]?.trim() || "";
}
