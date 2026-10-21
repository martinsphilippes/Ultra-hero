import type { ContentCardData } from "@/lib/catalog/queries";
import type { Pillar } from "@/lib/supabase/helpers";

// Grade do Explorar (estilo "Pesquisar" do Instagram): helpers puros, sem dependência de servidor,
// para serem testados em unidade e usados tanto no Server Component quanto na ação "carregar mais".

/** Quadros por carga: 15 = 5 linhas de 3 colunas. */
export const TILE_PAGE_SIZE = 15;

/** Maior offset aceito (cerca de 333 cargas): limita o custo de OFFSET no banco. */
export const MAX_OFFSET = 5000;

// Cursor da próxima página. Ao chegar ao teto, a grade termina (hasMore=false) em vez de pedir um
// offset que a ação recusaria e virar um erro permanente de "tentar de novo".
export function pageCursor(rowCount: number, offset: number, pageSize: number = TILE_PAGE_SIZE): { hasMore: boolean; nextOffset: number } {
  const nextOffset = offset + pageSize;
  return { hasMore: rowCount > pageSize && nextOffset <= MAX_OFFSET, nextOffset };
}

/** Semente do feed: muda uma vez por dia (UTC) para a ordem rotacionar sem quebrar a paginação. */
export function daySeed(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/** Capa do quadro, com placeholder do pilar quando o conteúdo não tem imagem. */
export function tileCover(coverUrl: string | null | undefined, pillar: Pillar): string {
  return coverUrl || `/placeholders/cover-${pillar}-1.svg`;
}

type TileLabelParts = {
  title: string;
  /** Nome do herói (texto já traduzido / vindo do banco). */
  creator?: string | null;
  /** Tipo já traduzido (catalog.types.*). */
  type: string;
  /** Restrição já traduzida ("Requer plano X", "Indisponível"); omitida quando livre. */
  restriction?: string | null;
};

// Nome acessível do quadro: o título visível fica só na página do conteúdo, então o link precisa
// descrever tudo em texto. O separador " · " é lido pelos E2E para extrair o herói (2º trecho).
export function tileLabel({ title, creator, type, restriction }: TileLabelParts): string {
  return [title, creator, type, restriction].filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

// A RPC garante no máximo um post por herói em cada rodada, mas na fronteira entre rodadas o último
// de uma e o primeiro da outra podem ser do mesmo herói. Este passe, só dentro da página (não muda
// quais itens vêm em cada offset, só a ordem local), afasta vizinhos repetidos quando há alternativa.
export function spreadCreators<T extends { id: string; creator: { slug: string } | null }>(items: T[]): T[] {
  const out = [...items];
  const key = (item: T) => item.creator?.slug ?? `#${item.id}`;
  for (let i = 1; i < out.length; i++) {
    if (key(out[i]) !== key(out[i - 1])) continue;
    const j = out.findIndex((item, index) => index > i && key(item) !== key(out[i - 1]));
    if (j === -1) break;
    const [moved] = out.splice(j, 1);
    out.splice(i, 0, moved);
  }
  return out;
}

export type ContentTileData = Pick<
  ContentCardData,
  "id" | "slug" | "title" | "cover_url" | "pillar" | "type" | "access_level" | "required_module" | "creator" | "source_locale"
>;

// Só o que o quadro precisa (o card completo traz resumo, duração etc. que aqui não aparecem).
export const CONTENT_TILE_SELECT =
  "id, slug, title, cover_url, pillar, type, access_level, source_locale, " +
  "required_module:plan_modules(code, name), creator:creator_profiles(slug, name, avatar_url)";

// ---------------------------------------------------------------- volta do conteúdo para a grade
// Ao abrir um quadro, a profundidade da grade (páginas carregadas) e o quadro aberto ficam guardados
// (sessionStorage da aba). Ao voltar pelo histórico, a grade recarrega as páginas e devolve a posição.

export type GridHistory = { key: string; pages: number; slug: string | null };

const HISTORY_FIELD = "exploreGrid";

/** Lê o estado salvo para esta grade (mesma busca, semente e idioma); null se não houver ou não bater. */
export function readGridHistory(state: unknown, key: string): GridHistory | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as Record<string, unknown>)[HISTORY_FIELD];
  if (!raw || typeof raw !== "object") return null;
  const { key: k, pages, slug } = raw as Record<string, unknown>;
  if (k !== key || typeof pages !== "number" || !Number.isInteger(pages) || pages < 1) return null;
  return { key, pages: Math.min(pages, Math.floor(MAX_OFFSET / TILE_PAGE_SIZE) + 1), slug: typeof slug === "string" && slug ? slug : null };
}

/** Novo objeto de estado: preserva os outros campos e só troca o da grade. */
export function writeGridHistory(state: unknown, value: GridHistory): Record<string, unknown> {
  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { ...base, [HISTORY_FIELD]: value };
}

/** Frases do anúncio ao leitor de tela, cada uma terminada em ponto. */
export function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => (/[.!?…]$/.test(part.trim()) ? part.trim() : `${part.trim()}.`))
    .join(" ");
}
