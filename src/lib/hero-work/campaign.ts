// Criar para a campanha (pedido do responsável, 04/11): da agenda o herói abre a campanha e, de lá, cria o post rápido,
// o post estruturado, o vídeo, as fotos, o programa ou a receita já com o contexto da campanha. Lógica pura (vitest).
//
// Decisões:
//   • O contexto viaja na URL como ?campanha=<id da oportunidade> (deal_talents.id): é o mesmo id da tela
//     /heroi/oportunidades/[id] e a RPC talent_opportunities(p_deal_talent) já confere no servidor que a oportunidade é
//     do herói logado (devolve vazio para qualquer outro id). Nada de id de negócio na URL.
//   • Só oferece criar quando o herói está confirmado (proposed/contracted) e o negócio não terminou.
//   • A legenda/descrição já vem com as @menções e #hashtags obrigatórias do briefing. "#publi" entra sempre que o
//     briefing não trouxer uma identificação de publicidade: é o primeiro item do checklist do herói (ad_label) e a
//     regra do CONAR para conteúdo pago. Nada repetido (sem diferenciar maiúsculas) e nada além do limite do campo.
//   • Depois de publicar, o herói volta à campanha com ?publicado=<slug>: a tela monta o link público
//     (<origem>/content/<slug>) e oferece "Enviar como entrega" com o link já preenchido (fluxo de entrega existente,
//     deliverable_submit_checked / publicar), sem migração nova.

import type { Brief } from "@/lib/brief/brief";
import { deliverableNextAction } from "@/lib/execution/vocab";
import type { DeliverableStatus } from "@/lib/deals/vocab";

/** O que o herói pode criar a partir da campanha (cada um abre o criador que já existe). */
export const CAMPAIGN_CREATE_KINDS = ["quick", "video", "photo", "structured", "workout", "program", "recipe"] as const;
export type CampaignCreateKind = (typeof CAMPAIGN_CREATE_KINDS)[number];

/** Identificações de publicidade aceitas (se o briefing já pede uma, não acrescenta #publi). */
const AD_TAGS = ["#publi", "#publicidade", "#ad", "#anuncio", "#anúncio", "#parceria", "#publipost"];
export const DEFAULT_AD_TAG = "#publi";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// slug público de conteúdo (content.slug): letras minúsculas, números e hífen
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;

export type HeroCampaign = {
  /** id da oportunidade (deal_talents.id): é o que vai em ?campanha= */
  id: string;
  dealId: string;
  title: string;
  brand: string;
  hashtags: string[];
  mentions: string[];
  links: string[];
  coupon: string;
  donts: string;
};

/** Valor de ?campanha= aceito (um uuid); qualquer outra coisa é ignorada. */
export function parseCampaignParam(raw: string | string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const s = v.trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
}

/** Valor de ?publicado= aceito (slug público do conteúdo). */
export function parsePublishedSlug(raw: string | string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const s = v.trim();
  return SLUG_RE.test(s) ? s : null;
}

/** O herói confirmado (proposta enviada ou contratado) num negócio que não terminou pode criar para a campanha. */
export function canCreateForCampaign(o: { status: string; dealStatus: string }): boolean {
  return ["proposed", "contracted"].includes(o.status) && !["won", "lost", "cancelled"].includes(o.dealStatus);
}

/** Monta o contexto a partir da oportunidade (talent_opportunities) — só o que o herói já pode ler. */
export function toHeroCampaign(o: { id: string; deal: { id: string; title: string }; brand: { name: string }; request: { brief: Brief } | null }): HeroCampaign {
  const b = o.request?.brief;
  return {
    id: o.id,
    dealId: o.deal.id,
    title: o.deal.title,
    brand: o.brand.name,
    hashtags: b?.hashtags ?? [],
    mentions: b?.mentions ?? [],
    links: b?.links ?? [],
    coupon: b?.coupon ?? "",
    donts: b?.donts ?? "",
  };
}

/** Marcas obrigatórias na ordem em que entram no texto: @menções, identificação de publicidade e #hashtags. */
export function campaignTags(c: Pick<HeroCampaign, "hashtags" | "mentions">): string[] {
  const hasAd = c.hashtags.some((h) => AD_TAGS.includes(h.toLowerCase()));
  const all = [...c.mentions, ...(hasAd ? [] : [DEFAULT_AD_TAG]), ...c.hashtags];
  const seen = new Set<string>();
  return all.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Acrescenta ao texto as marcas obrigatórias que ainda não estão nele (sem diferenciar maiúsculas), numa linha
 * própria no fim, sem passar de `max` caracteres (a marca que não couber fica de fora, inteira).
 */
export function withCampaignTags(text: string, tags: string[], max: number): string {
  const base = text.trimEnd();
  const present = new Set((base.match(/[#@][^\s#@,;]+/gu) ?? []).map((x) => x.toLowerCase()));
  const missing = tags.filter((x) => !present.has(x.toLowerCase()));
  if (missing.length === 0) return base.slice(0, max);
  let line = "";
  const sep = base ? "\n\n" : "";
  for (const tag of missing) {
    const next = line ? `${line} ${tag}` : tag;
    if (base.length + sep.length + next.length > max) break;
    line = next;
  }
  return line ? `${base}${sep}${line}` : base.slice(0, max);
}

/** Texto inicial (legenda do post, resumo do conteúdo) da campanha. */
export function campaignCaption(c: Pick<HeroCampaign, "hashtags" | "mentions">, max: number): string {
  return withCampaignTags("", campaignTags(c), max);
}

/** Onde cada atalho de "Criar para esta campanha" abre o criador (com o contexto na URL). */
export function campaignCreateHref(kind: CampaignCreateKind, campaignId: string): string {
  const q = `campanha=${encodeURIComponent(campaignId)}`;
  switch (kind) {
    case "quick":
      return `/heroi/post/novo?${q}`;
    case "video":
      return `/heroi/post/novo?${q}&tipo=video`;
    case "photo":
      return `/heroi/post/novo?${q}&tipo=foto`;
    case "structured":
      return `/heroi/conteudos/novo?${q}`;
    case "workout":
      return `/heroi/conteudos/novo?${q}&bloco=treino`;
    case "program":
      return `/heroi/conteudos/novo?${q}&bloco=programa`;
    case "recipe":
      return `/heroi/receitas/nova?${q}`;
  }
}

/** ?tipo= do post rápido: vídeo ou foto em destaque na primeira etapa. */
export function parsePostMode(raw: string | string[] | undefined | null): "video" | "photo" | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "video" ? "video" : v === "foto" ? "photo" : null;
}

/** ?bloco= do conteúdo estruturado: treino (pilar treino) ou programa. */
export function parseContentBlock(raw: string | string[] | undefined | null): "workout" | "program" | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "treino" ? "workout" : v === "programa" ? "program" : null;
}

/** Volta para a campanha depois de publicar (a tela oferece enviar o link como entrega). */
export function campaignReturnHref(campaignId: string, slug: string | null): string {
  const base = `/heroi/oportunidades/${encodeURIComponent(campaignId)}`;
  return slug ? `${base}?publicado=${encodeURIComponent(slug)}#entregas` : base;
}

/** Link público do conteúdo publicado (o que vai como link da entrega). */
export function publishedContentUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/content/${slug}`;
}

/** Entregas do herói que aceitam um link agora: enviar (planejada, em produção, ajuste) ou publicar (aprovada). */
export function deliverablesAwaitingLink<T extends { status: DeliverableStatus }>(list: T[]): (T & { action: "submit" | "publish" })[] {
  const out: (T & { action: "submit" | "publish" })[] = [];
  for (const d of list) {
    const next = deliverableNextAction(d.status, "talent");
    if (next === "submit" || next === "publish") out.push({ ...d, action: next });
  }
  return out;
}
