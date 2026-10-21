// Bibliotecas do hub do herói (RF-004). Regra pura (sem Supabase): classifica os conteúdos
// publicados por tipo e pilar e junta programas e produtos numa lista em ordem fixa.
import type { ContentType, Pillar } from "@/lib/supabase/helpers";

/** Chaves das bibliotecas: também são o segmento da URL (/personalities/[slug]/<chave>). */
export const LIBRARY_KEYS = ["rotina", "nutricao", "receitas", "treinos", "gastronomia", "programas", "produtos"] as const;
export type LibraryKey = (typeof LIBRARY_KEYS)[number];

/** Bibliotecas que agrupam conteúdos (as outras duas vêm de programas e produtos). */
export const CONTENT_LIBRARY_KEYS = ["rotina", "nutricao", "receitas", "treinos", "gastronomia"] as const;
export type ContentLibraryKey = (typeof CONTENT_LIBRARY_KEYS)[number];

/** O mínimo que a classificação precisa de um conteúdo. */
export type LibraryContent = { type: ContentType; pillar: Pillar };

export type CreatorLibrary<C extends LibraryContent, P, R> =
  | { key: ContentLibraryKey; kind: "content"; count: number; items: C[] }
  | { key: "programas"; kind: "programs"; count: number; items: P[] }
  | { key: "produtos"; kind: "products"; count: number; items: R[] };

export function isLibraryKey(value: string | null | undefined): value is LibraryKey {
  return (LIBRARY_KEYS as readonly string[]).includes(value ?? "");
}

export function isContentLibraryKey(value: string | null | undefined): value is ContentLibraryKey {
  return (CONTENT_LIBRARY_KEYS as readonly string[]).includes(value ?? "");
}

const PILLAR_LIBRARY: Record<Pillar, ContentLibraryKey> = {
  routine: "rotina",
  nutrition: "nutricao",
  training: "treinos",
  gastronomy: "gastronomia",
};

/**
 * Cada conteúdo entra numa única biblioteca. Prioridade: receita (qualquer pilar) > treino
 * (tipo workout ou pilar training) > pilar. Assim uma receita de nutrição fica só em Receitas
 * e um vídeo de treino fica só em Treinos.
 */
export function contentLibraryKey(content: LibraryContent): ContentLibraryKey {
  if (content.type === "recipe") return "receitas";
  if (content.type === "workout" || content.pillar === "training") return "treinos";
  return PILLAR_LIBRARY[content.pillar] ?? "rotina";
}

type Input<C extends LibraryContent, P, R> = {
  contents?: readonly C[] | null;
  programs?: readonly P[] | null;
  products?: readonly R[] | null;
  /** Bibliotecas que aparecem mesmo vazias (Receitas existe em todo herói). */
  always?: readonly LibraryKey[];
};

/**
 * Monta as bibliotecas na ordem fixa de LIBRARY_KEYS, só com as que têm pelo menos um item (ou que
 * estão em `always`).
 * A ordem dos itens dentro de cada biblioteca é a ordem de chegada (as queries já ordenam).
 */
export function buildCreatorLibraries<C extends LibraryContent, P, R>({ contents, programs, products, always = [] }: Input<C, P, R>): CreatorLibrary<C, P, R>[] {
  const byKey = new Map<ContentLibraryKey, C[]>(CONTENT_LIBRARY_KEYS.map((key) => [key, []]));
  for (const content of contents ?? []) byKey.get(contentLibraryKey(content))!.push(content);

  const all: CreatorLibrary<C, P, R>[] = [
    ...CONTENT_LIBRARY_KEYS.map((key) => {
      const items = byKey.get(key)!;
      return { key, kind: "content" as const, count: items.length, items };
    }),
    { key: "programas", kind: "programs", count: (programs ?? []).length, items: [...(programs ?? [])] },
    { key: "produtos", kind: "products", count: (products ?? []).length, items: [...(products ?? [])] },
  ];
  return all.filter((library) => library.count > 0 || always.includes(library.key));
}
