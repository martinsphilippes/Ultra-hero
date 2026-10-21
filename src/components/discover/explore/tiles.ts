import type { ContentCardData } from "@/lib/catalog/queries";
import type { Pillar } from "@/lib/supabase/helpers";

// Grade do Explorar (estilo "Pesquisar" do Instagram): helpers puros, sem dependência de servidor,
// para serem testados em unidade e usados tanto no Server Component quanto na ação "carregar mais".

/** Quadros por carga: 15 = 5 linhas de 3 colunas. */
export const TILE_PAGE_SIZE = 15;

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
