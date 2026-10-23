import { readFileSync } from "node:fs";
import path from "node:path";

// Leitura do banco que o servidor dos E2E usa (o remoto), só com a chave pública: serve para saber o que
// o banco já tem (função nova aplicada? comércio ligado?) antes de decidir o que o teste grava.

type Env = { url: string; key: string };

function fromDotEnv(): Record<string, string> {
  try {
    const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

export function supabaseEnv(): Env | null {
  const file = fromDotEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? file.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? file.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<{ status: number; body: unknown } | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/**
 * A função existe no banco? O visitante não tem execute nas RPCs do herói: existir dá 401/403
 * (permission denied) e não existir dá PGRST202. null quando não há como perguntar.
 */
export async function rpcExists(fn: string, args: Record<string, unknown>): Promise<boolean | null> {
  const r = await rpc(fn, args).catch(() => null);
  if (!r) return null;
  const code = (r.body as { code?: string } | null)?.code;
  if (code === "PGRST202") return false;
  return r.status === 401 || r.status === 403 || code === "42501";
}

/** Valor de public_settings (lido pelo visitante), ou undefined se não deu para ler. */
export async function publicSetting(key: string): Promise<unknown> {
  const r = await rpc("public_settings", {}).catch(() => null);
  if (!r || r.status !== 200 || !r.body || typeof r.body !== "object") return undefined;
  return (r.body as Record<string, unknown>)[key];
}
