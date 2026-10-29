// Foto no composer de post do herói (0043): constantes compartilhadas por cliente, servidor e testes.

export const POST_PHOTO_BUCKET = "post-photos";
/** Lado maior gerado no aparelho (a foto não é recortada). */
export const POST_PHOTO_MAX_EDGE = 2048;
/** Menor lado aceito pelo servidor: abaixo disso não é foto de post. */
export const POST_PHOTO_MIN_EDGE = 64;
/**
 * Arquivo enviado ao servidor (depois da redução). Passa pela server action (limite de 4 MB do
 * Next e ~4,5 MB da Vercel, com o multipart por cima); o bucket e o banco repetem o limite.
 */
export const POST_PHOTO_MAX_UPLOAD_BYTES = 3_670_016; // 3,5 MiB
/** Arquivo escolhido na câmera/galeria, antes da redução (foto de celular costuma ter 3–12 MB). */
export const POST_PHOTO_MAX_SOURCE_BYTES = 30 * 1024 * 1024;
/** Cota por herói por hora (post_photo_upload_claim repete o número). */
export const POST_PHOTO_UPLOADS_PER_HOUR = 30;
/** Kill switch em app_settings (exposto por public_settings). */
export const POST_PHOTO_SETTING = "post_photos.uploads_enabled";

/** Estado do envio de foto para a tela (como a capa do herói). */
export type PostPhotoState = "ready" | "disabled" | "not_configured";
