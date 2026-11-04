import "server-only";
import { listOpportunities } from "@/lib/deals/queries";
import { getTalentContext } from "@/lib/talent/server";
import { canCreateForCampaign, parseCampaignParam, toHeroCampaign, type HeroCampaign } from "./campaign";

/**
 * Contexto de campanha dos criadores (?campanha=<id da oportunidade>), validado no servidor: a RPC
 * talent_opportunities só devolve oportunidades do herói logado; fora disso (id de outro, campanha encerrada ou
 * herói ainda não confirmado) volta null e o criador abre como sempre, sem faixa nem texto pronto.
 */
export async function loadHeroCampaign(raw: string | string[] | undefined | null): Promise<HeroCampaign | null> {
  const id = parseCampaignParam(raw);
  if (!id) return null;
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const list = await listOpportunities(id);
  const o = list.items.find((x) => x.id === id);
  if (!o || !canCreateForCampaign({ status: o.status, dealStatus: o.deal.status })) return null;
  return toHeroCampaign(o);
}

/** Agenda do herói: negócio → tela da campanha (/heroi/oportunidades/<id da oportunidade>). */
export async function campaignHrefByDeal(): Promise<Map<string, string>> {
  const list = await listOpportunities();
  const map = new Map<string, string>();
  for (const o of list.items) map.set(o.deal.id, `/heroi/oportunidades/${o.id}`);
  return map;
}
