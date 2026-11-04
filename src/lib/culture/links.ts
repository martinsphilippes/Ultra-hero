// Rotas da Real-Time Culture e dos atalhos comerciais a partir do evento (0101). Módulo puro.
import type { CommercialItem } from "./select";

export type CulturePortal = "hero" | "brand" | "agency" | "admin";

export const AGENDA_BASE: Record<CulturePortal, string> = {
  hero: "/heroi/agenda",
  brand: "/marca/agenda",
  agency: "/agencia/agenda",
  admin: "/admin/agenda",
};

/** Detalhe do evento do Calendário Groscove no portal. */
export function eventHref(portal: CulturePortal, id: string): string {
  return portal === "admin" ? `/admin/agenda/${id}` : `${AGENDA_BASE[portal]}/groscove/${id}`;
}

export const newCampaignHref = (eventId: string) => `/marca/campanhas/nova?evento=${eventId}`;
export const newCallHref = (eventId: string) => `/marca/oportunidades/nova?evento=${eventId}`;
export function newSponsorshipHref(eventId: string, opts: { talentId?: string; brandId?: string } = {}): string {
  const q = new URLSearchParams({ evento: eventId });
  if (opts.talentId) q.set("heroi", opts.talentId);
  if (opts.brandId) q.set("marca", opts.brandId);
  return `/agencia/oportunidades/nova?${q.toString()}`;
}

/** Onde abrir um item do histórico comercial do evento, conforme o lado de quem lê (null = só leitura). */
export function commercialHref(item: Pick<CommercialItem, "kind" | "id" | "side" | "dealId">): string | null {
  switch (item.side) {
    case "brand":
      if (item.kind === "campaign") return `/marca/campanhas/${item.id}`;
      if (item.kind === "brand_call") return `/marca/oportunidades/chamadas/${item.id}`;
      return `/marca/oportunidades/${item.id}`;
    case "agency":
      if (item.kind === "campaign") return item.dealId ? `/agencia/negocios/${item.dealId}` : null;
      if (item.kind === "brand_call") return `/agencia/oportunidades/pedidos/${item.id}`;
      return `/agencia/oportunidades/${item.id}`;
    case "staff":
      return item.kind === "campaign" && item.dealId ? `/agencia/negocios/${item.dealId}` : null;
    case "hero":
      return item.kind === "campaign" && item.dealId ? `/heroi/oportunidades/${item.dealId}` : null;
    default:
      return null;
  }
}
