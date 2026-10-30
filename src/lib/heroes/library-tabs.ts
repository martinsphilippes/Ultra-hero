// Atalhos da página do herói (0050): regra pura, sem servidor nem banco, testada em unidade.
// As fontes (o que alimenta cada atalho) são fixas: LIBRARY_KEYS. A configuração só muda a
// apresentação. Precedência por campo: exceção do herói > categoria principal > padrão do código.
import { LIBRARY_KEYS, type LibraryKey } from "@/lib/catalog/creator-libraries";

/** Ícones que o admin pode escolher (o banco aceita só estes; o app mapeia para o lucide). */
export const LIBRARY_ICON_KEYS = [
  "sunrise",
  "camera",
  "apple",
  "salad",
  "chef-hat",
  "utensils",
  "dumbbell",
  "trophy",
  "layers",
  "shopping-bag",
  "music",
  "mic",
  "palette",
  "star",
  "heart",
  "book-open",
] as const;
export type LibraryIconKey = (typeof LIBRARY_ICON_KEYS)[number];

export function isLibraryIconKey(value: unknown): value is LibraryIconKey {
  return typeof value === "string" && (LIBRARY_ICON_KEYS as readonly string[]).includes(value);
}

/** Ícone padrão de cada fonte (o de antes da 0050). */
export const DEFAULT_LIBRARY_ICON: Record<LibraryKey, LibraryIconKey> = {
  "dia-a-dia": "sunrise",
  nutricao: "apple",
  alimentacao: "chef-hat",
  treinos: "dumbbell",
  gastronomia: "utensils",
  programas: "layers",
  produtos: "shopping-bag",
};

/** Ordem padrão: a de LIBRARY_KEYS, de 10 em 10. */
export function defaultSortOrder(key: LibraryKey): number {
  return (LIBRARY_KEYS.indexOf(key) + 1) * 10;
}

export const LIBRARY_LABEL_MAX = 40;
export type LibraryLabel = { "pt-BR": string; en?: string; es?: string };

/** Linha da categoria (hero_library_tabs). label/icon null = padrão. */
export type CategoryTabRow = {
  categoryId: string;
  sourceKey: string;
  label: unknown;
  icon: string | null;
  sortOrder: number;
  isVisible: boolean;
};

/** Linha da exceção do herói (creator_library_overrides). Campo null = herda. */
export type OverrideRow = {
  sourceKey: string;
  label: unknown;
  icon: string | null;
  sortOrder: number | null;
  isVisible: boolean | null;
};

/** Vínculo do herói com a categoria (position 1 = principal). */
export type CategoryLinkRow = { categoryId: string; position: number };

/** De onde veio cada valor: para o admin mostrar "herdado de…" ou "exceção". */
export type TabOrigin = "default" | "category" | "override";

export type ResolvedTab = {
  key: LibraryKey;
  /** Rótulo configurado (por idioma); null = rótulo padrão das mensagens. */
  label: LibraryLabel | null;
  icon: LibraryIconKey;
  sortOrder: number;
  isVisible: boolean;
  origin: { label: TabOrigin; icon: TabOrigin; sortOrder: TabOrigin; isVisible: TabOrigin };
};

/** Lê o jsonb do rótulo: objeto com pt-BR não vazio, ou null. */
export function parseLibraryLabel(value: unknown): LibraryLabel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const map = value as Record<string, unknown>;
  const read = (key: string) => (typeof map[key] === "string" ? (map[key] as string).trim() : "");
  const pt = read("pt-BR");
  if (!pt) return null;
  const label: LibraryLabel = { "pt-BR": pt };
  if (read("en")) label.en = read("en");
  if (read("es")) label.es = read("es");
  return label;
}

/** Rótulo no idioma pedido; sem tradução cai no pt-BR (como as categorias, 0049). */
export function labelForLocale(label: LibraryLabel | null, locale: string): string | null {
  if (!label) return null;
  return (locale === "en" ? label.en : locale === "es" ? label.es : undefined) || label["pt-BR"];
}

/** Categoria que vale para o herói: a de menor posição entre as visíveis (a principal, posição 1). */
export function primaryCategoryId(links: readonly CategoryLinkRow[]): string | null {
  const sorted = [...links].sort((a, b) => a.position - b.position);
  return sorted[0]?.categoryId ?? null;
}

/**
 * Configuração efetiva das 7 fontes (inclusive as ocultas), na ordem final.
 * categoryRows pode trazer linhas de várias categorias: só as de categoryId contam.
 * Desempate da ordem: a ordem padrão das fontes.
 */
export function resolveLibraryConfig({
  categoryId,
  categoryRows = [],
  overrideRows = [],
}: {
  categoryId: string | null;
  categoryRows?: readonly CategoryTabRow[];
  overrideRows?: readonly OverrideRow[];
}): ResolvedTab[] {
  const byCategory = new Map(categoryId ? categoryRows.filter((row) => row.categoryId === categoryId).map((row) => [row.sourceKey, row]) : []);
  const byOverride = new Map(overrideRows.map((row) => [row.sourceKey, row]));

  const tabs = LIBRARY_KEYS.map((key): ResolvedTab => {
    const category = byCategory.get(key);
    const override = byOverride.get(key);
    const overrideLabel = parseLibraryLabel(override?.label);
    const categoryLabel = parseLibraryLabel(category?.label);
    const overrideIcon = isLibraryIconKey(override?.icon) ? override.icon : null;
    const categoryIcon = isLibraryIconKey(category?.icon) ? category.icon : null;
    const overrideOrder = typeof override?.sortOrder === "number" ? override.sortOrder : null;
    const overrideVisible = typeof override?.isVisible === "boolean" ? override.isVisible : null;

    return {
      key,
      label: overrideLabel ?? categoryLabel ?? null,
      icon: overrideIcon ?? categoryIcon ?? DEFAULT_LIBRARY_ICON[key],
      sortOrder: overrideOrder ?? category?.sortOrder ?? defaultSortOrder(key),
      isVisible: overrideVisible ?? category?.isVisible ?? true,
      origin: {
        label: overrideLabel ? "override" : categoryLabel ? "category" : "default",
        icon: overrideIcon ? "override" : categoryIcon ? "category" : "default",
        sortOrder: overrideOrder !== null ? "override" : category ? "category" : "default",
        isVisible: overrideVisible !== null ? "override" : category ? "category" : "default",
      },
    };
  });
  return tabs.sort((a, b) => a.sortOrder - b.sortOrder || LIBRARY_KEYS.indexOf(a.key) - LIBRARY_KEYS.indexOf(b.key));
}

export type LibraryTile = { key: LibraryKey; label: string | null; icon: LibraryIconKey; count: number };

/**
 * Atalhos da página do herói: configuração efetiva, só os visíveis e com itens (ou em `always`),
 * com o rótulo já no idioma (null = rótulo padrão das mensagens).
 */
export function resolveLibraryTiles({
  links = [],
  categoryRows = [],
  overrideRows = [],
  counts,
  always = [],
  locale,
}: {
  links?: readonly CategoryLinkRow[];
  categoryRows?: readonly CategoryTabRow[];
  overrideRows?: readonly OverrideRow[];
  counts: Partial<Record<LibraryKey, number>>;
  always?: readonly LibraryKey[];
  locale: string;
}): LibraryTile[] {
  return resolveLibraryConfig({ categoryId: primaryCategoryId(links), categoryRows, overrideRows })
    .filter((tab) => tab.isVisible && ((counts[tab.key] ?? 0) > 0 || always.includes(tab.key)))
    .map((tab) => ({ key: tab.key, label: labelForLocale(tab.label, locale), icon: tab.icon, count: counts[tab.key] ?? 0 }));
}

/** Rótulos iguais entre atalhos visíveis (aviso no admin: dois "Treinos" confundem). */
export function duplicateLabels(labels: readonly { visible: boolean; text: string }[]): string[] {
  const seen = new Map<string, number>();
  for (const { visible, text } of labels) {
    if (!visible) continue;
    const key = text.trim().toLocaleLowerCase("pt-BR");
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = new Set([...seen].filter(([, n]) => n > 1).map(([key]) => key));
  const out: string[] = [];
  for (const { visible, text } of labels) {
    const key = text.trim().toLocaleLowerCase("pt-BR");
    if (visible && dupes.has(key) && !out.some((t) => t.toLocaleLowerCase("pt-BR") === key)) out.push(text.trim());
  }
  return out;
}

/**
 * Diferença entre o que o admin quer para o herói e o que ele herdaria: só os campos diferentes
 * viram exceção (null = herda). Fonte sem diferença fica fora (sem exceção).
 */
export function overrideDiff(
  inherited: readonly Pick<ResolvedTab, "key" | "label" | "icon" | "sortOrder" | "isVisible">[],
  wanted: readonly { key: LibraryKey; label: LibraryLabel | null; icon: LibraryIconKey; sortOrder: number; isVisible: boolean }[],
): { source_key: LibraryKey; label: LibraryLabel | null; icon: LibraryIconKey | null; sort_order: number | null; is_visible: boolean | null }[] {
  const base = new Map(inherited.map((tab) => [tab.key, tab]));
  const sameLabel = (a: LibraryLabel | null, b: LibraryLabel | null) =>
    (a?.["pt-BR"] ?? "") === (b?.["pt-BR"] ?? "") && (a?.en ?? "") === (b?.en ?? "") && (a?.es ?? "") === (b?.es ?? "");
  const out: ReturnType<typeof overrideDiff> = [];
  for (const row of wanted) {
    const from = base.get(row.key);
    if (!from) continue;
    const diff = {
      source_key: row.key,
      label: sameLabel(row.label, from.label) ? null : row.label,
      icon: row.icon === from.icon ? null : row.icon,
      sort_order: row.sortOrder === from.sortOrder ? null : row.sortOrder,
      is_visible: row.isVisible === from.isVisible ? null : row.isVisible,
    };
    if (diff.label !== null || diff.icon !== null || diff.sort_order !== null || diff.is_visible !== null) out.push(diff);
  }
  return out;
}

/** Linha do editor do admin (campos de texto sempre string; vazio = padrão/herda). */
export type LibraryTabEditorRow = {
  key: LibraryKey;
  label: { "pt-BR": string; en: string; es: string };
  icon: LibraryIconKey;
  isVisible: boolean;
  /** Rótulo mostrado quando o campo pt-BR fica vazio (padrão do app ou o herdado da categoria). */
  fallbackLabel: string;
  /** Só no herói: a linha tem exceção gravada. */
  overridden?: boolean;
};

/**
 * Configuração efetiva → linhas do editor. Na categoria, os campos trazem o rótulo da categoria;
 * no herói, só o rótulo da exceção (o herdado aparece como fallbackLabel).
 */
export function toEditorRows(effective: readonly ResolvedTab[], fallbackLabel: (key: LibraryKey) => string, mode: "category" | "hero"): LibraryTabEditorRow[] {
  return effective.map((tab) => {
    const own = mode === "category" || tab.origin.label === "override" ? tab.label : null;
    const row: LibraryTabEditorRow = {
      key: tab.key,
      label: { "pt-BR": own?.["pt-BR"] ?? "", en: own?.en ?? "", es: own?.es ?? "" },
      icon: tab.icon,
      isVisible: tab.isVisible,
      fallbackLabel: fallbackLabel(tab.key),
    };
    if (mode === "hero") row.overridden = Object.values(tab.origin).includes("override");
    return row;
  });
}
