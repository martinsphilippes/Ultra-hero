import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

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

/**
 * O banco já tem a 0040 (listas com produto e programa)? Pergunta pela própria resposta do PostgREST:
 * a coluna list_items.item_type existe = 200 (o visitante não vê linhas, a RLS devolve vazio); não
 * existe = 400 com 42703. null quando não há como perguntar.
 */
export async function listsAcceptProductsAndPrograms(): Promise<boolean | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const res = await fetch(`${env.url}/rest/v1/list_items?select=item_type&limit=0`, { headers: { apikey: env.key } }).catch(() => null);
  if (!res) return null;
  if (res.ok) return true;
  const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
  return code === "42703" || code === "PGRST204" ? false : null;
}

/**
 * O banco já tem a 0041 (favoritos com produto e programa)? Mesma pergunta das listas, na coluna
 * favorites.item_type. null quando não há como perguntar.
 */
export async function favoritesAcceptProductsAndPrograms(): Promise<boolean | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const res = await fetch(`${env.url}/rest/v1/favorites?select=item_type&limit=0`, { headers: { apikey: env.key } }).catch(() => null);
  if (!res) return null;
  if (res.ok) return true;
  const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
  return code === "42703" || code === "PGRST204" ? false : null;
}

/** Valor de public_settings (lido pelo visitante), ou undefined se não deu para ler. */
export async function publicSetting(key: string): Promise<unknown> {
  const r = await rpc("public_settings", {}).catch(() => null);
  if (!r || r.status !== 200 || !r.body || typeof r.body !== "object") return undefined;
  return (r.body as Record<string, unknown>)[key];
}

// ---------------------------------------------------------------- sessão do navegador (testes reais)
// Os testes reais (E2E_*_REAL=1) gravam no remoto e precisam devolver a conta demo ao estado de antes,
// inclusive o que a tela não mostra (ex.: os dois avatares do herói). A sessão vem do cookie do
// Supabase do próprio navegador do teste: lê e grava só as linhas da própria conta, sob a RLS.

type BrowserSession = { accessToken: string; userId: string };

/** Sessão do navegador (cookie sb-*-auth-token, inteiro ou em pedaços .0, .1…), ou null. */
export async function browserSession(page: Page): Promise<BrowserSession | null> {
  const cookies = (await page.context().cookies()).filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  if (cookies.length === 0) return null;
  const part = (name: string) => Number(name.match(/\.(\d+)$/)?.[1] ?? -1);
  const raw = cookies
    .sort((a, b) => part(a.name) - part(b.name))
    .map((c) => decodeURIComponent(c.value))
    .join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8") : raw;
  try {
    const parsed = JSON.parse(json) as { access_token?: string; user?: { id?: string } };
    return parsed.access_token && parsed.user?.id ? { accessToken: parsed.access_token, userId: parsed.user.id } : null;
  } catch {
    return null;
  }
}

async function rest(page: Page, method: "GET" | "POST" | "PATCH" | "DELETE", pathAndQuery: string, body?: unknown): Promise<unknown> {
  const env = supabaseEnv();
  const session = await browserSession(page);
  if (!env || !session) throw new Error("sem Supabase ou sem sessão no navegador");
  const res = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: env.key, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${pathAndQuery}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Os dois avatares da própria conta: o do app (profiles) e o do perfil público (creator_profiles), se herói. */
export type OwnAvatars = { profile: string | null; creatorId: string | null; creator: string | null };

export async function readOwnAvatars(page: Page): Promise<OwnAvatars> {
  const session = await browserSession(page);
  if (!session) throw new Error("sem sessão no navegador");
  const [profiles, creators] = (await Promise.all([
    rest(page, "GET", `profiles?select=avatar_url&id=eq.${session.userId}`),
    rest(page, "GET", `creator_profiles?select=id,avatar_url&user_id=eq.${session.userId}`),
  ])) as [{ avatar_url: string | null }[], { id: string; avatar_url: string | null }[]];
  return { profile: profiles[0]?.avatar_url ?? null, creatorId: creators[0]?.id ?? null, creator: creators[0]?.avatar_url ?? null };
}

/** Devolve os dois avatares ao estado lido antes do teste (só o que mudou). */
export async function restoreOwnAvatars(page: Page, original: OwnAvatars) {
  const session = await browserSession(page);
  if (!session) throw new Error("sem sessão no navegador");
  const now = await readOwnAvatars(page);
  if (now.profile !== original.profile) await rest(page, "PATCH", `profiles?id=eq.${session.userId}`, { avatar_url: original.profile });
  if (original.creatorId && now.creator !== original.creator) await rest(page, "PATCH", `creator_profiles?id=eq.${original.creatorId}`, { avatar_url: original.creator });
}

/** Capa do perfil de herói da própria conta (creator_profiles.cover_url), ou null sem perfil. */
export type OwnCover = { creatorId: string | null; cover: string | null };

export async function readOwnCover(page: Page): Promise<OwnCover> {
  const session = await browserSession(page);
  if (!session) throw new Error("sem sessão no navegador");
  const rows = (await rest(page, "GET", `creator_profiles?select=id,cover_url&user_id=eq.${session.userId}`)) as { id: string; cover_url: string | null }[];
  return { creatorId: rows[0]?.id ?? null, cover: rows[0]?.cover_url ?? null };
}

/** Devolve a capa ao valor lido antes do teste (só se mudou; a coluna é gravável pelo próprio herói). */
export async function restoreOwnCover(page: Page, original: OwnCover) {
  if (!original.creatorId) return;
  const now = await readOwnCover(page);
  if (now.cover !== original.cover) await rest(page, "PATCH", `creator_profiles?id=eq.${original.creatorId}`, { cover_url: original.cover });
}

// ---------------------------------------------------------------- listas pessoais (testes de lista)
/** Apaga as listas da própria conta com este nome exato (os itens vão junto, on delete cascade). */
export async function deleteOwnListsNamed(page: Page, name: string): Promise<number> {
  const session = await browserSession(page);
  if (!session) return 0;
  const deleted = (await rest(page, "DELETE", `custom_lists?user_id=eq.${session.userId}&name=eq.${encodeURIComponent(name)}`)) as unknown[];
  return deleted.length;
}

// ---------------------------------------------------------------- favoritos (testes de favoritos)
export type FavoriteColumn = "content_id" | "product_id" | "program_id";

/** Ids dos alvos favoritados pela própria conta nesta coluna (ex.: os conteúdos favoritos). */
export async function ownFavoriteTargets(page: Page, column: FavoriteColumn): Promise<string[]> {
  const session = await browserSession(page);
  if (!session) throw new Error("sem sessão no navegador");
  const rows = (await rest(page, "GET", `favorites?select=${column}&user_id=eq.${session.userId}&${column}=not.is.null`)) as Record<string, string>[];
  return rows.map((r) => r[column]).sort();
}

/** Deixa o favorito da própria conta neste alvo como pedido (true = existe, false = não existe). */
export async function setOwnFavorite(page: Page, column: FavoriteColumn, id: string, favorite: boolean): Promise<void> {
  const session = await browserSession(page);
  if (!session) throw new Error("sem sessão no navegador");
  const has = (await ownFavoriteTargets(page, column)).includes(id);
  if (favorite && !has) await rest(page, "POST", "favorites", { user_id: session.userId, [column]: id });
  if (!favorite && has) await rest(page, "DELETE", `favorites?user_id=eq.${session.userId}&${column}=eq.${id}`);
}

/** Id de um produto ou programa publicado pelo slug (leitura pública). */
export async function publicIdBySlug(table: "products" | "programs", slug: string): Promise<string | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const res = await fetch(`${env.url}/rest/v1/${table}?select=id&slug=eq.${encodeURIComponent(slug)}`, { headers: { apikey: env.key } }).catch(() => null);
  const rows = res?.ok ? ((await res.json()) as { id: string }[]) : [];
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------- post com foto (teste real, E2E_POST_PHOTO_REAL=1)
// O herói não apaga conteúdo que já foi ao ar (nem pela RLS nem pelas RPCs). O teste real de
// publicação limpa o que criou com o service role do .env.local (só no processo do teste, nunca no
// navegador): apaga o conteúdo, o objeto do bucket post-photos e marca o envio.

export function serviceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromDotEnv().SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export async function deletePhotoPostAsService(slug: string): Promise<{ content: number; photo: string | null }> {
  const env = supabaseEnv();
  const key = serviceRoleKey();
  if (!env || !key) throw new Error("sem Supabase ou sem SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const found = await fetch(`${env.url}/rest/v1/content?select=id,cover_url&slug=eq.${encodeURIComponent(slug)}`, { headers });
  const row = ((await found.json()) as { id: string; cover_url: string | null }[])[0];
  if (!row) return { content: 0, photo: null };
  const path = row.cover_url?.split("/storage/v1/object/public/post-photos/")[1] ?? null;
  const deleted = (await (await fetch(`${env.url}/rest/v1/content?id=eq.${row.id}`, { method: "DELETE", headers })).json()) as unknown[];
  if (path) {
    await fetch(`${env.url}/storage/v1/object/post-photos/${path}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    await fetch(`${env.url}/rest/v1/post_photo_uploads?path=eq.${encodeURIComponent(path)}`, { method: "PATCH", headers, body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
  }
  return { content: deleted.length, photo: path };
}
