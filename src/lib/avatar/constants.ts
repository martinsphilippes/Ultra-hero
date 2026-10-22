// Foto de perfil (0031): constantes compartilhadas por cliente, servidor e testes.

export const AVATAR_BUCKET = "avatars";
/** Lado do quadrado gerado no aparelho: cobre o maior uso (128 px no card do herói, em tela 3x). */
export const AVATAR_SIZE = 512;
/** Arquivo escolhido na câmera/galeria, antes do redimensionamento. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
/** Arquivo enviado ao servidor (depois do redimensionamento); o bucket e o banco repetem o limite. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Lado máximo aceito pelo servidor (o aparelho gera 512). */
export const MAX_DIMENSION = 1024;
/** Cota por usuário em 24 h (avatar_upload_claim repete o número). */
export const UPLOADS_PER_DAY = 20;
export const AVATAR_MIMES = ["image/webp", "image/jpeg"] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];
/** Kill switch em app_settings (exposto por public_settings). */
export const AVATAR_SETTING = "avatars.uploads_enabled";

/** Ilustrações locais oferecidas nos formulários de perfil. */
export const ILLUSTRATIONS = Array.from({ length: 8 }, (_, i) => `/placeholders/avatar-${i + 1}.svg`);
export const ILLUSTRATION_RE = /^\/placeholders\/avatar-[1-8]\.svg$/;

/** Códigos de erro que a interface traduz em me.profile.photo.errors. */
export const AVATAR_ERRORS = [
  "not_image",
  "empty_file",
  "file_too_large",
  "decode_failed",
  "invalid_dimensions",
  "too_many_uploads",
  "uploads_disabled",
  "avatar_not_configured",
  "upload_failed",
  "unauthenticated",
  "generic",
] as const;
export type AvatarError = (typeof AVATAR_ERRORS)[number];

export function toAvatarError(code: string | null | undefined): AvatarError {
  return (AVATAR_ERRORS as readonly string[]).includes(code ?? "") ? (code as AvatarError) : "generic";
}
