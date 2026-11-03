// Lógica pura do diálogo "Sugerir heróis" do negócio (0093): ordenação, selos, busca, validação do herói digitado
// e montagem da lista enviada à RPC agency_deal_suggest_heroes. As regras de nome/perfil/e-mail espelham as da RPC
// (o banco confere de novo; aqui é só para avisar antes de enviar).
import type { Reason } from "./vocab";

export const PAGE_SIZE = 20;
/** Máximo de heróis no elenco do negócio por salvamento (igual à RPC). */
export const MAX_SUGGEST = 30;
/** Máximo de fichas novas criadas num salvamento (igual à RPC). */
export const MAX_NEW_PER_SAVE = 10;
export const MAX_SEARCH_LENGTH = 60;
export const NAME_MIN = 2;
export const NAME_MAX = 80;

/** casting: ficha da agência · outside: herói da plataforma sem ficha aqui · other_agency / person_in_casting: indisponíveis. */
export type HeroScope = "casting" | "outside" | "other_agency" | "person_in_casting";
export type PlatformScope = Exclude<HeroScope, "casting">;

export type HeroSocials = { instagram: string | null; youtube: string | null; site: string | null };

/** Linha da busca na plataforma (campos públicos; a RPC não devolve direitos nem conta). */
export type PlatformHero = {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  pillars: string[];
  followers: number | null;
  scope: PlatformScope;
  socials: HeroSocials;
};

export type HeroSearchPage = { items: PlatformHero[]; hasMore: boolean };

const SCOPES: readonly string[] = ["outside", "other_agency", "person_in_casting"];

/** Lê o json da RPC agency_hero_search com tolerância (linha mal formada some, nunca quebra a tela). */
export function parseHeroSearch(raw: unknown): HeroSearchPage {
  const obj = raw && typeof raw === "object" ? (raw as { items?: unknown; has_more?: unknown }) : {};
  const list = Array.isArray(obj.items) ? obj.items : [];
  const items: PlatformHero[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r.id !== "string" || typeof r.name !== "string" || typeof r.slug !== "string") continue;
    const scope = typeof r.scope === "string" && SCOPES.includes(r.scope) ? (r.scope as PlatformScope) : "other_agency";
    const soc = (r.socials && typeof r.socials === "object" ? r.socials : {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
    items.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      avatarUrl: str(r.avatar_url),
      headline: str(r.headline),
      pillars: Array.isArray(r.pillars) ? r.pillars.filter((p): p is string => typeof p === "string").slice(0, 4) : [],
      followers: typeof r.followers === "number" && r.followers > 0 ? r.followers : null,
      scope,
      socials: { instagram: str(soc.instagram), youtube: str(soc.youtube), site: str(soc.site) },
    });
  }
  return { items, hasMore: obj.has_more === true };
}

/** Junta a próxima página sem repetir herói (a ordem da busca é estável, mas o clique duplo existe). */
export function mergePlatformPages(current: PlatformHero[], next: PlatformHero[]): PlatformHero[] {
  const seen = new Set(current.map((h) => h.id));
  return [...current, ...next.filter((h) => !seen.has(h.id))];
}

// ---------------------------------------------------------------- busca e ordenação
/** Minúsculas e sem acento (busca local no casting; o servidor faz o mesmo no banco). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Texto da busca: sem controle, espaços únicos, no máximo 60 (o servidor corta igual). */
export function normalizeQuery(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
}

export type CastingOption = { id: string; name: string; slug: string | null; reasons: Reason[] };

export const metCount = (reasons: Reason[]) => reasons.filter((r) => r.met).length;

/** Fichas do casting filtradas pelo texto (nome ou endereço do herói) e ordenadas por critérios atendidos, depois nome. */
export function filterAndSortCasting<T extends CastingOption>(list: T[], q: string): T[] {
  const needle = fold(normalizeQuery(q));
  return list
    .filter((c) => !needle || fold(c.name).includes(needle) || (c.slug !== null && fold(c.slug).includes(needle)))
    .sort((a, b) => metCount(b.reasons) - metCount(a.reasons) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- selos
export type ScopeBadge = { scope: HeroScope; variant: "success" | "info" | "neutral" | "warning"; selectable: boolean };

/** Selo e se dá para escolher: só "no casting" e "fora do casting" entram no negócio. */
export function scopeBadge(scope: HeroScope): ScopeBadge {
  switch (scope) {
    case "casting":
      return { scope, variant: "success", selectable: true };
    case "outside":
      return { scope, variant: "info", selectable: true };
    case "other_agency":
      return { scope, variant: "warning", selectable: false };
    default:
      return { scope: "person_in_casting", variant: "warning", selectable: false };
  }
}

/** Seguidores em forma compacta no idioma da tela (null quando não há número). */
export function followersLabel(followers: number | null, locale: string): string | null {
  if (followers === null || followers <= 0) return null;
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(followers);
}

// ---------------------------------------------------------------- herói digitado
export type TypedHeroInput = { name: string; profile: string; email: string };
export type TypedHero = { name: string; profile: string | null; email: string | null };
export type TypedHeroErrors = Partial<Record<"name" | "profile" | "email", "required" | "invalid">>;

/** Nome limpo como na RPC: sem controle nem < >, espaços únicos. */
export function cleanHeroName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
}

const HANDLE = /^@[A-Za-z0-9._]{1,40}$/;
const LINK = /^https?:\/\/[^\s<>"']{4,190}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "@ana", "ana.souza", "instagram.com/ana" ou "https://..." → "@ana" ou link https; null se não der. */
export function normalizeProfileRef(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  if (HANDLE.test(v)) return v;
  if (/^[A-Za-z0-9._]{1,40}$/.test(v) && !v.includes("..")) return `@${v}`;
  const link = /^https?:\/\//i.test(v) ? v : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) ? `https://${v}` : v;
  return LINK.test(link) && link.length <= 200 ? link : null;
}

/** Valida o herói digitado: nome obrigatório (2 a 80), perfil e e-mail opcionais mas, se vierem, válidos. */
export function validateTypedHero(input: TypedHeroInput): { ok: true; value: TypedHero } | { ok: false; errors: TypedHeroErrors } {
  const errors: TypedHeroErrors = {};
  const name = cleanHeroName(input.name);
  if (name.length === 0) errors.name = "required";
  else if (name.length < NAME_MIN || name.length > NAME_MAX) errors.name = "invalid";
  const profileRaw = input.profile.trim();
  const profile = profileRaw === "" ? null : normalizeProfileRef(profileRaw);
  if (profileRaw !== "" && profile === null) errors.profile = "invalid";
  const emailRaw = input.email.trim().toLowerCase();
  if (emailRaw !== "" && (!EMAIL.test(emailRaw) || emailRaw.length > 254)) errors.email = "invalid";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, profile, email: emailRaw === "" ? null : emailRaw } };
}

/** Já existe um digitado com o mesmo nome (sem caixa nem acento)? A RPC também reaproveita a ficha de mesmo nome. */
export function sameTypedName(a: string, b: string): boolean {
  return fold(cleanHeroName(a)) === fold(cleanHeroName(b));
}

// ---------------------------------------------------------------- envio
export type SuggestItem =
  | { kind: "talent"; talentId: string; reasons: Reason[] }
  | { kind: "hero"; creatorId: string; reasons: Reason[] }
  | { kind: "typed"; name: string; profile?: string; email?: string; reasons: Reason[] };

/** Monta a lista da RPC: fichas do casting escolhidas, heróis de fora escolhidos e digitados, sem repetir. */
export function buildSuggestItems(input: { talents: { id: string; reasons: Reason[] }[]; heroes: { id: string }[]; typed: TypedHero[] }): SuggestItem[] {
  const out: SuggestItem[] = [];
  const talents = new Set<string>();
  for (const t of input.talents) {
    if (talents.has(t.id)) continue;
    talents.add(t.id);
    out.push({ kind: "talent", talentId: t.id, reasons: t.reasons });
  }
  const heroes = new Set<string>();
  for (const h of input.heroes) {
    if (heroes.has(h.id)) continue;
    heroes.add(h.id);
    out.push({ kind: "hero", creatorId: h.id, reasons: [] });
  }
  const names: string[] = [];
  for (const t of input.typed) {
    if (names.some((n) => sameTypedName(n, t.name))) continue;
    names.push(t.name);
    out.push({ kind: "typed", name: t.name, ...(t.profile ? { profile: t.profile } : {}), ...(t.email ? { email: t.email } : {}), reasons: [] });
  }
  return out;
}

/** Quantas fichas novas o salvamento cria: heróis de fora e digitados (os do casting já têm ficha). */
export function newFichaCount(items: SuggestItem[]): number {
  return items.filter((i) => i.kind !== "talent").length;
}

export type SuggestCheck = "ok" | "too_many" | "too_many_new";

/** Confere os limites antes de enviar (a RPC recusa do mesmo jeito). */
export function checkSuggestLimits(items: SuggestItem[]): SuggestCheck {
  if (items.length > MAX_SUGGEST) return "too_many";
  if (newFichaCount(items) > MAX_NEW_PER_SAVE) return "too_many_new";
  return "ok";
}
