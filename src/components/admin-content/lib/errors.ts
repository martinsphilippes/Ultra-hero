// Normaliza erros de RPC/PostgREST para {code, detail}: "codigo: detalhe" vira code + detail,
// e os SQLSTATE mais comuns viram códigos legíveis (traduzidos depois no servidor).
export type ParsedError = { code: string; detail: string | null };

const SQLSTATE_MAP: Record<string, string> = {
  "23505": "duplicate",
  "23514": "constraint",
  "23503": "reference",
  "42501": "forbidden",
  "22P02": "invalid_input",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseActionError(error: unknown): ParsedError {
  let message = "";
  let sqlstate: string | null = null;
  if (typeof error === "string") message = error;
  else if (error instanceof Error) message = error.message;
  else if (isRecord(error)) {
    message = typeof error.message === "string" ? error.message : "";
    sqlstate = typeof error.code === "string" ? error.code : null;
  }
  // Mensagens do PostgREST para RAISE EXCEPTION costumam ser só o texto do raise.
  const [rawCode, ...rest] = message.split(":");
  const code = rawCode.trim();
  const detail = rest.join(":").trim() || null;
  // Códigos levantados com RAISE EXCEPTION (ex.: 'cannot_publish_missing') têm formato snake_case.
  if (/^[a-z][a-z0-9_]*$/.test(code)) return { code, detail };
  if (sqlstate && SQLSTATE_MAP[sqlstate]) return { code: SQLSTATE_MAP[sqlstate], detail: null };
  // Violação de check com nome conhecido (ex.: content_free_only)
  if (/violates check constraint/.test(message)) return { code: "constraint", detail: null };
  if (/duplicate key value/.test(message)) return { code: "duplicate", detail: null };
  if (/violates foreign key constraint/.test(message)) return { code: "reference", detail: null };
  if (/permission denied|row-level security/.test(message)) return { code: "forbidden", detail: null };
  return { code: "generic", detail: null };
}
