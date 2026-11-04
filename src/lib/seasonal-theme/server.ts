import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { type AdminTheme, parseAdminTheme } from "./form";
import { resolveActive } from "./resolve";
import { toPublicTheme } from "./normalize";
import type { PublicSeasonTheme, SeasonArea } from "./vocab";
import { SEASON_CACHE_TAG, SEASON_PREVIEW_COOKIE } from "./vocab";

type Row = Record<string, unknown>;

// Leitura do tema sazonal (0100). Visitante e usuário leem SÓ as linhas ativas (política + grants por coluna), sem
// função nova para anon. A consulta é a mesma para todos, então fica em cache de dados por 5 min (sem cookies: cliente
// anônimo) e o admin invalida a tag ao salvar; o vencedor é escolhido a cada requisição com a hora atual, então o fim
// de um tema vale na hora e o início (a política já devolve o que começa nos próximos 10 min) também.

const PUBLIC_COLUMNS = "id, priority, areas, tokens, background, decorations, animations, banner, window_start, window_end";

const loadCandidates = unstable_cache(
  async (): Promise<PublicSeasonTheme[]> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return [];
    try {
      const supabase = createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await supabase.from("seasonal_themes").select(PUBLIC_COLUMNS).limit(50);
      // tabela ainda não migrada, rede fora: identidade padrão (o tema nunca derruba a página)
      if (error || !data) return [];
      return (data as Row[]).map(toPublicTheme).filter((t): t is PublicSeasonTheme => t !== null);
    } catch {
      return [];
    }
  },
  ["seasonal-themes-active"],
  { revalidate: 300, tags: [SEASON_CACHE_TAG] },
);

export type ResolvedSeason = { theme: PublicSeasonTheme; preview: { name: string; outOfArea: boolean } | null };

/** Tema de pré-visualização do admin (cookie); qualquer outra pessoa recebe null (a RPC exige is_platform_admin). */
async function loadPreview(): Promise<ResolvedSeason | null> {
  const id = (await cookies()).get(SEASON_PREVIEW_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("seasonal_themes_admin", { p_id: id });
    if (error || !data) return null;
    const row = ((data as { themes?: Row[] }).themes ?? [])[0];
    if (!row) return null;
    // a prévia ignora estado e datas (é o ponto), mas mantém as áreas
    const theme = toPublicTheme({ ...row, window_start: row.window_start ?? new Date(0).toISOString(), window_end: row.window_end ?? new Date(8.64e15).toISOString() });
    return theme ? { theme, preview: { name: typeof row.name === "string" ? row.name : "", outOfArea: false } } : null;
  } catch {
    return null;
  }
}

/** Tema que vale agora nesta área (pré-visualização do admin primeiro). null = identidade padrão. */
export async function getSeasonForArea(area: SeasonArea): Promise<ResolvedSeason | null> {
  const preview = await loadPreview();
  if (preview) {
    if (preview.theme.areas.includes(area)) return preview;
    // a área não está no tema: nada muda, só o aviso de pré-visualização
    return { theme: { ...preview.theme, areas: [area], tokens: {}, background: { type: "none" }, decorations: [], banner: {}, animations: false }, preview: { ...preview.preview!, outOfArea: true } };
  }
  const theme = resolveActive(await loadCandidates(), new Date(), area);
  return theme ? { theme, preview: null } : null;
}

/** Painel do admin: interruptor e todos os temas (a RPC exige is_platform_admin). available=false → banco sem a 0100. */
export async function loadAdminThemes(id?: string): Promise<{ available: boolean; forbidden: boolean; enabled: boolean; themes: AdminTheme[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("seasonal_themes_admin", { p_id: id ?? null });
    if (error) return { available: !/function|does not exist|schema cache/i.test(error.message), forbidden: error.code === "42501", enabled: false, themes: [] };
    const d = (data ?? {}) as { enabled?: boolean; themes?: unknown[] };
    return { available: true, forbidden: false, enabled: d.enabled !== false, themes: (d.themes ?? []).map(parseAdminTheme).filter((x): x is AdminTheme => x !== null) };
  } catch {
    return { available: false, forbidden: false, enabled: false, themes: [] };
  }
}
