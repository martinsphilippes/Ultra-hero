import { z } from "zod";
import { fold, normalizeQuery, validateTypedHero, type TypedHero } from "@/lib/deals/hero-suggest";

// Hero da oportunidade de patrocínio (0095): lógica pura, testada em tests/unit/oportunidade-heroi.test.ts.
// O Hero é a página pública do creator para quem o evento acontece. A agência escolhe entre os Heros da plataforma
// (ficha do casting, Hero fora do casting ou ficha digitada) e o banco confere tudo de novo (agency_sponsorship_save).
//
// Consentimento: continua exigido para a oportunidade ficar visível às marcas (status "aberta"); rascunho vale sem ele.
// Aqui ficam só as regras para avisar antes de enviar; quem decide é o banco.

export const PICKER_PAGE_SIZE = 20;
export const HERO_KINDS = ["talent", "hero", "typed"] as const;
export type HeroKind = (typeof HERO_KINDS)[number];
export type HeroConsent = "active" | "revoked" | "none";
/** casting: ficha da agência · outside: Hero da plataforma sem ficha aqui · other_agency / person_in_casting: indisponíveis. */
export type HeroScope = "casting" | "outside" | "other_agency" | "person_in_casting";
const SCOPES: readonly string[] = ["casting", "outside", "other_agency", "person_in_casting"];
const CONSENTS: readonly string[] = ["active", "revoked", "none"];

/** Linha da busca de Heros da oportunidade (campos públicos; a RPC não devolve direitos, conta nem e-mail). */
export type OpportunityHero = {
  /** talent: ficha do casting (com ou sem página) · hero: Hero da plataforma fora do casting */
  kind: "talent" | "hero";
  talentId: string | null;
  creatorId: string | null;
  slug: string | null;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  pillars: string[];
  followers: number | null;
  scope: HeroScope;
  /** só no casting */
  consent: HeroConsent | null;
  socials: { instagram: string | null; youtube: string | null; site: string | null };
};

export type OpportunityHeroPage = { items: OpportunityHero[]; hasMore: boolean };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Lê o json de agency_opportunity_hero_search com tolerância (linha mal formada some, nunca quebra a tela). */
export function parseOpportunityHeroes(raw: unknown): OpportunityHeroPage {
  const obj = raw && typeof raw === "object" ? (raw as { items?: unknown; has_more?: unknown }) : {};
  const list = Array.isArray(obj.items) ? obj.items : [];
  const items: OpportunityHero[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r.name !== "string") continue;
    const kind = r.kind === "talent" ? "talent" : r.kind === "hero" ? "hero" : null;
    const talentId = str(r.talent_id);
    const creatorId = str(r.creator_id);
    if (kind === null || (kind === "talent" && talentId === null) || (kind === "hero" && creatorId === null)) continue;
    const scope = typeof r.scope === "string" && SCOPES.includes(r.scope) ? (r.scope as HeroScope) : "other_agency";
    const soc = (r.socials && typeof r.socials === "object" ? r.socials : {}) as Record<string, unknown>;
    items.push({
      kind,
      talentId,
      creatorId,
      slug: str(r.slug),
      name: r.name,
      avatarUrl: str(r.avatar_url),
      headline: str(r.headline),
      pillars: Array.isArray(r.pillars) ? r.pillars.filter((p): p is string => typeof p === "string").slice(0, 4) : [],
      followers: typeof r.followers === "number" && r.followers > 0 ? r.followers : null,
      scope,
      consent: typeof r.consent === "string" && CONSENTS.includes(r.consent) ? (r.consent as HeroConsent) : null,
      socials: { instagram: str(soc.instagram), youtube: str(soc.youtube), site: str(soc.site) },
    });
  }
  return { items, hasMore: obj.has_more === true };
}

/** Chave estável da linha (ficha do casting ou Hero da plataforma). */
export function heroKey(h: Pick<OpportunityHero, "kind" | "talentId" | "creatorId">): string {
  return h.kind === "talent" ? `t:${h.talentId}` : `h:${h.creatorId}`;
}

/** Junta a próxima página sem repetir (a ordem é estável, mas o clique duplo existe). */
export function mergeHeroPages(current: OpportunityHero[], next: OpportunityHero[]): OpportunityHero[] {
  const seen = new Set(current.map(heroKey));
  return [...current, ...next.filter((h) => !seen.has(heroKey(h)))];
}

/** Só "no casting" e "fora do casting" dão para escolher (os outros dois são de outra agência ou da mesma pessoa). */
export function heroSelectable(scope: HeroScope): boolean {
  return scope === "casting" || scope === "outside";
}

export { fold, normalizeQuery };

// ---------------------------------------------------------------- a escolha guardada no formulário
/** Hero escolhido: o que o formulário mostra e o que a RPC recebe. */
export type HeroChoice = {
  kind: HeroKind;
  /** ficha do casting (kind talent) */
  talentId: string | null;
  /** Hero da plataforma (kind hero) ou página ligada à ficha (kind talent) */
  creatorId: string | null;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  headline: string | null;
  pillars: string[];
  /** consentimento da ficha: fora do casting e digitado nascem "none" */
  consent: HeroConsent;
  /** só no digitado */
  profile: string;
  email: string;
};

export const heroChoiceSchema = z
  .object({
    kind: z.enum(HERO_KINDS),
    talentId: z.uuid().nullable(),
    creatorId: z.uuid().nullable(),
    name: z.string().trim().max(200),
    slug: z.string().max(200).nullable(),
    avatarUrl: z.string().max(2000).nullable(),
    headline: z.string().max(300).nullable(),
    pillars: z.array(z.string().max(40)).max(10),
    consent: z.enum(["active", "revoked", "none"]),
    profile: z.string().trim().max(200),
    email: z.string().trim().max(254),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "talent" && v.talentId === null) ctx.addIssue({ code: "custom", path: ["talentId"], message: "required" });
    if (v.kind === "hero" && v.creatorId === null) ctx.addIssue({ code: "custom", path: ["creatorId"], message: "required" });
    if (v.kind === "typed") {
      const checked = validateTypedHero({ name: v.name, profile: v.profile, email: v.email });
      if (!checked.ok) ctx.addIssue({ code: "custom", path: ["name"], message: "typed" });
    }
  });

/** Escolha a partir de uma linha da busca. */
export function choiceFromSearch(h: OpportunityHero): HeroChoice {
  return {
    kind: h.kind,
    talentId: h.kind === "talent" ? h.talentId : null,
    creatorId: h.creatorId,
    name: h.name,
    slug: h.slug,
    avatarUrl: h.avatarUrl,
    headline: h.headline,
    pillars: h.pillars,
    consent: h.kind === "talent" ? (h.consent ?? "none") : "none",
    profile: "",
    email: "",
  };
}

/** Escolha a partir do Hero digitado (já validado por validateTypedHero). */
export function choiceFromTyped(t: TypedHero): HeroChoice {
  return { kind: "typed", talentId: null, creatorId: null, name: t.name, slug: null, avatarUrl: null, headline: null, pillars: [], consent: "none", profile: t.profile ?? "", email: t.email ?? "" };
}

/** Escolha a partir do Hero que a oportunidade já tem (leitura da agência): é sempre a ficha do casting. */
export function choiceFromHeroInfo(h: HeroInfo): HeroChoice {
  return {
    kind: "talent",
    talentId: h.talentId,
    creatorId: h.creatorId,
    name: h.name,
    slug: h.slug,
    avatarUrl: h.avatarUrl,
    headline: h.headline,
    pillars: h.pillars,
    consent: h.consent,
    profile: "",
    email: "",
  };
}

/** Objeto enviado à RPC (agency_sponsorship_save → p_data.hero). */
export function heroChoiceToDb(c: HeroChoice): Record<string, string> {
  if (c.kind === "talent") return { kind: "talent", talent_id: c.talentId ?? "" };
  if (c.kind === "hero") return { kind: "hero", creator_id: c.creatorId ?? "" };
  return { kind: "typed", name: c.name, profile: c.profile, email: c.email };
}

// ---------------------------------------------------------------- consentimento e publicação
/** O Hero pode ser mostrado às marcas? Só com consentimento vigente (a ficha de fora e a digitada ainda não têm). */
export function heroHasConsent(c: Pick<HeroChoice, "consent">): boolean {
  return c.consent === "active";
}

export type PublishBlock = "no_hero" | "consent" | "inactive" | null;

/** Por que não dá para publicar (null = dá). `heroActive` false = a página do Hero está suspensa ou saiu do ar. */
export function publishBlock(hero: Pick<HeroChoice, "consent"> | null, heroActive = true): PublishBlock {
  if (!hero) return "no_hero";
  if (!heroActive) return "inactive";
  return heroHasConsent(hero) ? null : "consent";
}

/** Botões do formulário: criando, os dois; rascunho, os dois; aberta, só salvar. */
export function formActions(status: "new" | "draft" | "open"): { saveDraft: boolean; publish: boolean; save: boolean } {
  return status === "open" ? { saveDraft: false, publish: false, save: true } : { saveDraft: true, publish: true, save: false };
}

// ---------------------------------------------------------------- Hero de uma oportunidade (leituras)
/** O Hero da oportunidade como as leituras trazem (sponsorship_hero_json). A marca só recebe a página com consentimento. */
export type HeroInfo = {
  talentId: string;
  name: string;
  hasHero: boolean;
  heroActive: boolean;
  creatorId: string | null;
  slug: string | null;
  avatarUrl: string | null;
  headline: string | null;
  pillars: string[];
  consent: HeroConsent;
};

export function toHeroInfo(raw: unknown, fallbackName = "", fallbackTalent = ""): HeroInfo {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    talentId: str(r.talent_id) ?? fallbackTalent,
    name: str(r.name) ?? fallbackName,
    hasHero: r.has_hero === true,
    heroActive: r.hero_active === true,
    creatorId: str(r.creator_id),
    slug: str(r.slug),
    avatarUrl: str(r.avatar_url),
    headline: str(r.headline),
    pillars: Array.isArray(r.pillars) ? r.pillars.filter((p): p is string => typeof p === "string") : [],
    consent: typeof r.consent === "string" && CONSENTS.includes(r.consent) ? (r.consent as HeroConsent) : "none",
  };
}

/** Endereço da página pública do Hero (null sem página ou sem permissão de mostrar). */
export function heroPagePath(h: Pick<HeroInfo, "slug">): string | null {
  return h.slug ? `/personalities/${h.slug}` : null;
}

/** Atalhos da ficha do Hero na agência (casting): ficha e documentos (onde o termo assinado entra). */
export function fichaLinks(talentId: string | null): { ficha: string; documents: string } | null {
  return talentId ? { ficha: `/agencia/casting/${talentId}`, documents: `/agencia/casting/${talentId}/documentos` } : null;
}
