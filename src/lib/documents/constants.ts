// Tipos e tamanho aceitos no bucket agency-docs (iguais à 0064: bucket e check de documents).
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type DocumentMime = (typeof DOCUMENT_MIME_TYPES)[number];
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

// Telas que mostram documentos: o cliente só escolhe entre estes caminhos para revalidar (revisão de
// segurança da etapa B: revalidatePath com qualquer caminho esvaziava o cache de outras rotas).
const REVALIDATE_PATHS = [/^\/agencia\/casting\/[0-9a-f-]{36}\/documentos$/];

export function isDocumentsRevalidatePath(path: string): boolean {
  return path.length <= 200 && REVALIDATE_PATHS.some((re) => re.test(path));
}
