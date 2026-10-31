// Tipos e tamanho aceitos no bucket agency-docs (iguais à 0064: bucket e check de documents).
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type DocumentMime = (typeof DOCUMENT_MIME_TYPES)[number];
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
