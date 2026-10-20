// Erros vindos do banco chegam como "codigo" ou "codigo: detalhe" (RAISE EXCEPTION),
// ou como mensagens do Postgres (RLS, unique, check). Normaliza para { code, detail }.

export type RpcError = { code: string; detail: string | null };

export function parseRpcError(message: string | null | undefined): RpcError {
  if (!message) return { code: "generic", detail: null };
  if (/row-level security/i.test(message)) return { code: "forbidden", detail: null };
  if (/duplicate key value/i.test(message)) return { code: "slug_conflict", detail: null };
  if (/violates check constraint/i.test(message)) return { code: "invalid_input", detail: null };
  if (/permission denied/i.test(message)) return { code: "forbidden", detail: null };
  const idx = message.indexOf(":");
  if (idx === -1) return { code: message.trim(), detail: null };
  return { code: message.slice(0, idx).trim(), detail: message.slice(idx + 1).trim() || null };
}

// Serializa para o cliente como "codigo" ou "codigo:detalhe" (o componente traduz o código).
export function rpcErrorToString(error: RpcError): string {
  return error.detail ? `${error.code}:${error.detail}` : error.code;
}

export function splitErrorString(value: string): RpcError {
  const idx = value.indexOf(":");
  if (idx === -1) return { code: value, detail: null };
  return { code: value.slice(0, idx), detail: value.slice(idx + 1) || null };
}

// Problemas devolvidos por cart_validate / checkout_cart (cart_changed:<json>).
export type CartIssue = {
  product_id: string;
  title: string;
  issue: "unavailable_or_suspended" | "out_of_stock" | "price_changed";
  old_price?: number;
  new_price?: number;
};

export function parseCartIssues(value: unknown): CartIssue[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    .filter((i) => typeof i.product_id === "string" && typeof i.issue === "string")
    .map((i) => ({
      product_id: i.product_id as string,
      title: typeof i.title === "string" ? i.title : "",
      issue: i.issue as CartIssue["issue"],
      old_price: typeof i.old_price === "number" ? i.old_price : undefined,
      new_price: typeof i.new_price === "number" ? i.new_price : undefined,
    }));
}
