// Briefing estruturado da campanha (0080) e checklists de publicidade. Lógica pura (testada com vitest).
//
// Decisões:
//   • O briefing mora no pedido (campaign_requests.brief) e tem as mesmas regras do banco (campaign_brief_valid):
//     hashtags começam com # (até 15), @menções só com letras, números, ponto, hífen e sublinhado (até 15), links e
//     referências são https (até 10 cada), cupom sem espaço (até 40), "o que não fazer" até 1000 caracteres e até
//     10 itens extras de checklist da campanha (3 a 120 caracteres). Nada repetido (sem diferenciar maiúsculas).
//   • Quem digita pode separar por vírgula, espaço ou linha; o app completa o # / @ que faltar e tira repetidos.
//   • Os itens dos checklists seguem brief_check_items (mesma ordem): a lista do app e a do banco precisam bater,
//     porque o banco confere que todos os itens da lista foram marcados.

import { z } from "zod";

export const MAX_TAGS = 15;
export const MAX_LINKS = 10;
export const MAX_CHECKS = 10;
export const MAX_COUPON = 40;
export const MAX_DONTS = 1000;

export type Brief = {
  hashtags: string[];
  mentions: string[];
  links: string[];
  coupon: string;
  references: string[];
  donts: string;
  /** itens extras do checklist (da campanha) */
  checks: string[];
};

export const EMPTY_BRIEF: Brief = { hashtags: [], mentions: [], links: [], coupon: "", references: [], donts: "", checks: [] };

const HASHTAG_RE = /^#[^\s#@]{1,60}$/u;
const MENTION_RE = /^@[A-Za-z0-9._-]{1,60}$/;
const HTTPS_RE = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{2,5})?([/?#][^\s<>"]*)?$/;
const COUPON_RE = /^\S{0,40}$/;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Tira repetidos sem diferenciar maiúsculas (fica a primeira grafia). */
export function uniqueCi(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const splitWords = (text: string) => text.split(/[\s,;]+/u).map((x) => x.trim()).filter(Boolean);

/** "publi, #verao  #Verao" → ["#publi", "#verao"] (inválidas ficam de fora; ver invalidTags). */
export function parseHashtags(text: string): string[] {
  return uniqueCi(splitWords(text).map((w) => (w.startsWith("#") ? w : `#${w}`)).filter((w) => HASHTAG_RE.test(w))).slice(0, MAX_TAGS);
}

/** "marca, @loja.oficial" → ["@marca", "@loja.oficial"]. */
export function parseMentions(text: string): string[] {
  return uniqueCi(splitWords(text).map((w) => (w.startsWith("@") ? w : `@${w}`)).filter((w) => MENTION_RE.test(w))).slice(0, MAX_TAGS);
}

/** Um link por linha (ou separados por espaço); só https. */
export function parseLinks(text: string): string[] {
  return uniqueCi(splitWords(text).filter((w) => HTTPS_RE.test(w) && w.length <= 500)).slice(0, MAX_LINKS);
}

/** Um item por linha (3 a 120 caracteres). */
export function parseChecks(text: string): string[] {
  return uniqueCi(text.split(/\n+/).map((x) => x.trim().replace(/\s+/g, " ")).filter((x) => x.length >= 3 && x.length <= 120)).slice(0, MAX_CHECKS);
}

export function cleanCoupon(text: string): string {
  return text.replace(/\s+/g, "").slice(0, MAX_COUPON);
}

/** Palavras digitadas que não viraram hashtag/@/link (para avisar quem digita). */
export function invalidEntries(text: string, kind: "hashtags" | "mentions" | "links"): string[] {
  const ok = kind === "hashtags" ? parseHashtags(text) : kind === "mentions" ? parseMentions(text) : parseLinks(text);
  const okKeys = new Set(ok.map((x) => x.toLowerCase()));
  return splitWords(text).filter((w) => {
    const v = kind === "links" ? w : kind === "hashtags" ? (w.startsWith("#") ? w : `#${w}`) : w.startsWith("@") ? w : `@${w}`;
    return !okKeys.has(v.toLowerCase());
  });
}

/** Mesmas regras do banco (campaign_brief_valid). */
export function briefValid(b: Brief): boolean {
  const unique = (l: string[]) => new Set(l.map((x) => x.toLowerCase())).size === l.length;
  return (
    b.hashtags.length <= MAX_TAGS &&
    b.hashtags.every((x) => HASHTAG_RE.test(x)) &&
    unique(b.hashtags) &&
    b.mentions.length <= MAX_TAGS &&
    b.mentions.every((x) => MENTION_RE.test(x)) &&
    unique(b.mentions) &&
    b.links.length <= MAX_LINKS &&
    b.links.every((x) => HTTPS_RE.test(x) && x.length <= 500) &&
    unique(b.links) &&
    b.references.length <= MAX_LINKS &&
    b.references.every((x) => HTTPS_RE.test(x) && x.length <= 500) &&
    unique(b.references) &&
    COUPON_RE.test(b.coupon) &&
    b.donts.length <= MAX_DONTS &&
    b.checks.length <= MAX_CHECKS &&
    b.checks.every((x) => x.length >= 3 && x.length <= 120 && x === x.trim()) &&
    unique(b.checks)
  );
}

/** JSON do banco (request.brief / deal_execution.brief) → Brief. Campos desconhecidos são ignorados. */
export function toBrief(raw: unknown): Brief {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_BRIEF, hashtags: [], mentions: [], links: [], references: [], checks: [] };
  const r = raw as Record<string, unknown>;
  return {
    hashtags: strings(r.hashtags),
    mentions: strings(r.mentions),
    links: strings(r.links),
    coupon: typeof r.coupon === "string" ? r.coupon : "",
    references: strings(r.references),
    donts: typeof r.donts === "string" ? r.donts : "",
    checks: strings(r.checks),
  };
}

/** Brief → JSON para as RPCs (só as chaves com conteúdo; texto aparado). */
export function briefPayload(b: Brief): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (b.hashtags.length > 0) out.hashtags = b.hashtags;
  if (b.mentions.length > 0) out.mentions = b.mentions;
  if (b.links.length > 0) out.links = b.links;
  if (b.coupon.trim()) out.coupon = b.coupon.trim();
  if (b.references.length > 0) out.references = b.references;
  if (b.donts.trim()) out.donts = b.donts.trim();
  if (b.checks.length > 0) out.checks = b.checks;
  return out;
}

/** Algo foi preenchido (para mostrar o bloco). */
export function briefDefined(b: Brief): boolean {
  return b.hashtags.length + b.mentions.length + b.links.length + b.references.length + b.checks.length > 0 || b.coupon !== "" || b.donts.trim() !== "";
}

// ---------------------------------------------------------------- checklists
export const BRAND_STANDARD_CHECKS = ["ad_label", "brand_mention", "link_coupon", "no_health_claims", "follows_brief"] as const;
export const TALENT_STANDARD_CHECKS = ["ad_label", "brand_mention", "follows_brief"] as const;
export type StandardCheck = (typeof BRAND_STANDARD_CHECKS)[number];

export type CheckSide = "brand" | "talent";
export type CheckItem =
  | { key: string; kind: "standard"; code: StandardCheck }
  | { key: string; kind: "hashtag" | "mention" | "link" | "coupon" | "extra"; value: string }
  | { key: string; kind: "donts"; value: string };

/** Itens do checklist de cada lado, na ordem de brief_check_items. */
export function checkItems(b: Brief, side: CheckSide): CheckItem[] {
  const std: CheckItem[] = (side === "brand" ? BRAND_STANDARD_CHECKS : TALENT_STANDARD_CHECKS).map((code) => ({ key: code, kind: "standard", code }));
  const fromBrief: CheckItem[] =
    side === "brand"
      ? []
      : [
          ...b.hashtags.map((v) => ({ key: `hashtag:${v}`, kind: "hashtag" as const, value: v })),
          ...b.mentions.map((v) => ({ key: `mention:${v}`, kind: "mention" as const, value: v })),
          ...b.links.map((v) => ({ key: `link:${v}`, kind: "link" as const, value: v })),
          ...(b.coupon ? [{ key: `coupon:${b.coupon}`, kind: "coupon" as const, value: b.coupon }] : []),
          ...(b.donts.trim() ? [{ key: "donts", kind: "donts" as const, value: b.donts.trim() }] : []),
        ];
  const extras: CheckItem[] = b.checks.map((v) => ({ key: `extra:${v}`, kind: "extra", value: v }));
  return [...std, ...fromBrief, ...extras];
}

/** Itens da lista ainda não marcados. */
export function missingChecks(items: CheckItem[], checked: Iterable<string>): CheckItem[] {
  const set = new Set(checked);
  return items.filter((i) => !set.has(i.key));
}

/** Itens marcados que fazem parte da lista, na ordem da lista (o que vai para a RPC). */
export function checkedKeys(items: CheckItem[], checked: Iterable<string>): string[] {
  const set = new Set(checked);
  return items.filter((i) => set.has(i.key)).map((i) => i.key);
}

/** Chave gravada na versão → item (para mostrar o checklist conferido; chaves estranhas viram "extra"). */
export function itemFromKey(key: string): CheckItem {
  if ((BRAND_STANDARD_CHECKS as readonly string[]).includes(key)) return { key, kind: "standard", code: key as StandardCheck };
  if (key === "donts") return { key, kind: "donts", value: "" };
  const idx = key.indexOf(":");
  const prefix = idx > 0 ? key.slice(0, idx) : "";
  const value = idx > 0 ? key.slice(idx + 1) : key;
  if (prefix === "hashtag" || prefix === "mention" || prefix === "link" || prefix === "coupon" || prefix === "extra") return { key, kind: prefix, value };
  return { key, kind: "extra", value: key };
}

// ---------------------------------------------------------------- formulário (texto livre ↔ Brief)
export type BriefDraft = { hashtags: string; mentions: string; links: string; coupon: string; references: string; donts: string; checks: string };

export const EMPTY_BRIEF_DRAFT: BriefDraft = { hashtags: "", mentions: "", links: "", coupon: "", references: "", donts: "", checks: "" };

export function briefToDraft(b: Brief): BriefDraft {
  return { hashtags: b.hashtags.join(" "), mentions: b.mentions.join(" "), links: b.links.join("\n"), coupon: b.coupon, references: b.references.join("\n"), donts: b.donts, checks: b.checks.join("\n") };
}

export function draftToBrief(d: BriefDraft): Brief {
  return {
    hashtags: parseHashtags(d.hashtags),
    mentions: parseMentions(d.mentions),
    links: parseLinks(d.links),
    coupon: cleanCoupon(d.coupon),
    references: parseLinks(d.references),
    donts: d.donts.trim().slice(0, MAX_DONTS),
    checks: parseChecks(d.checks),
  };
}

/** Forma recebida pelas server actions (o banco confere de novo). */
export const briefSchema = z
  .object({
    hashtags: z.array(z.string()).max(MAX_TAGS),
    mentions: z.array(z.string()).max(MAX_TAGS),
    links: z.array(z.string()).max(MAX_LINKS),
    coupon: z.string().max(MAX_COUPON),
    references: z.array(z.string()).max(MAX_LINKS),
    donts: z.string().max(MAX_DONTS),
    checks: z.array(z.string()).max(MAX_CHECKS),
  })
  .refine(briefValid, "brief");
