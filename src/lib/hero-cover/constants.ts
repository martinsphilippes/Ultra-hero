// Capa do herói com foto real (0042): constantes compartilhadas por cliente, servidor e testes.

export const COVER_BUCKET = "hero-covers";
/** Tamanho gerado no aparelho: 16:9, a proporção das capas oficiais (1600x900). */
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 900;
/** Faixa de largura aceita pelo servidor (o aparelho gera 1600); a altura segue 16:9. */
export const COVER_MIN_WIDTH = 640;
export const COVER_MAX_WIDTH = 1600;
/** Arquivo enviado ao servidor (depois da redução); o bucket e o banco repetem o limite. */
export const COVER_MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
/** Cota por usuário em 24 h (hero_cover_upload_claim repete o número). */
export const COVER_UPLOADS_PER_DAY = 20;
/** Kill switch em app_settings (exposto por public_settings). */
export const COVER_SETTING = "hero_covers.uploads_enabled";

/** Códigos de erro que a interface traduz em creator.profile.cover.errors. */
export const COVER_ERRORS = [
  "not_image",
  "empty_file",
  "file_too_large",
  "decode_failed",
  "invalid_dimensions",
  "too_many_uploads",
  "uploads_disabled",
  "cover_not_configured",
  "not_a_hero",
  "upload_failed",
  "unauthenticated",
  "generic",
] as const;
export type CoverError = (typeof COVER_ERRORS)[number];

export function toCoverError(code: string | null | undefined): CoverError {
  return (COVER_ERRORS as readonly string[]).includes(code ?? "") ? (code as CoverError) : "generic";
}
