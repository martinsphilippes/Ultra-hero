import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { collectiblePhase, type CollectiblePhase } from "./rules";

// Leituras dos Colecionáveis (0057). Sem pagamento online: o vencedor só vê "Você arrematou!".
// Tudo sob a RLS da sessão: o público lê o item e os lances
// (sem id de usuário); cada pessoa lê só os próprios donos de lance e o próprio resultado.
// Sem a 0057 no banco (tabela ausente) as leituras devolvem "indisponível" e a tela esconde o recurso.

type Client = SupabaseClient<Database>;

export type CollectibleHero = { name: string; slug: string; avatar_url: string | null };

export type CollectibleView = {
  id: string;
  title: string;
  description: string;
  photos: string[];
  authenticityNote: string;
  hero: CollectibleHero | null;
  creatorId: string | null;
  durationMinutes: number;
  startPriceCents: number;
  currentCents: number;
  increments: number[];
  bidsCount: number;
  leadingBidId: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  extensionsCount: number;
  winnerLabel: string | null;
  finalizedAt: string | null;
  isDemo: boolean;
};

export type PublicBid = { id: string; amountCents: number; label: string | null; createdAt: string };

export type MyCollectibleState = {
  bidIds: string[];
  won: boolean;
};

export const EMPTY_MINE: MyCollectibleState = { bidIds: [], won: false };

const ITEM_SELECT =
  "id, title, description, photos, authenticity_note, start_price_cents, current_cents, bid_increments_cents, bids_count, leading_bid_id, " +
  "status, starts_at, ends_at, extensions_count, winner_label, finalized_at, is_demo, creator_id, duration_minutes, creator:creator_profiles(name, slug, avatar_url)";

type ItemRow = {
  id: string;
  title: string;
  description: string;
  photos: string[] | null;
  authenticity_note: string;
  start_price_cents: number;
  current_cents: number;
  bid_increments_cents: number[] | null;
  bids_count: number;
  leading_bid_id: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  extensions_count: number;
  winner_label: string | null;
  finalized_at: string | null;
  is_demo: boolean;
  creator_id: string | null;
  duration_minutes: number;
  creator: CollectibleHero | null;
};

function toView(row: ItemRow): CollectibleView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    photos: row.photos ?? [],
    authenticityNote: row.authenticity_note,
    hero: row.creator ?? null,
    creatorId: row.creator_id,
    durationMinutes: row.duration_minutes,
    startPriceCents: row.start_price_cents,
    currentCents: row.current_cents,
    increments: row.bid_increments_cents ?? [],
    bidsCount: row.bids_count,
    leadingBidId: row.leading_bid_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    extensionsCount: row.extensions_count,
    winnerLabel: row.winner_label,
    finalizedAt: row.finalized_at,
    isDemo: row.is_demo,
  };
}

export function phaseOf(item: Pick<CollectibleView, "status" | "startsAt" | "endsAt">, nowMs = Date.now()): CollectiblePhase {
  return collectiblePhase(item.status, item.startsAt, item.endsAt, nowMs);
}

/** Foto de capa (a 1ª) ou a imagem neutra padrão. */
export function coverPhoto(item: Pick<CollectibleView, "photos">): string {
  return item.photos[0] ?? "/collectibles/ball.svg";
}

export type CollectiblesList = { available: boolean; live: CollectibleView[]; upcoming: CollectibleView[]; ended: CollectibleView[] };

const ENDED_WINDOW_MS = 30 * 24 * 3600 * 1000;

/**
 * Vitrine pública: ao vivo (acaba primeiro no topo), em breve e encerrados nos últimos 30 dias.
 * Rascunho e cancelado ficam fora (mesmo para o admin, que vê tudo pela RLS).
 */
export async function fetchCollectiblesList(supabase: Client, nowMs = Date.now()): Promise<CollectiblesList> {
  try {
    const { data, error } = await supabase
      .from("collectibles")
      .select(ITEM_SELECT)
      .in("status", ["scheduled", "live", "ended"])
      .gte("ends_at", new Date(nowMs - ENDED_WINDOW_MS).toISOString())
      .order("ends_at", { ascending: true })
      .limit(60);
    if (error || !data) return { available: false, live: [], upcoming: [], ended: [] };
    const items = (data as unknown as ItemRow[]).map(toView);
    return {
      available: true,
      live: items.filter((i) => phaseOf(i, nowMs) === "live"),
      upcoming: items.filter((i) => phaseOf(i, nowMs) === "scheduled").sort((a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "")),
      ended: items.filter((i) => phaseOf(i, nowMs) === "ended").reverse(),
    };
  } catch {
    return { available: false, live: [], upcoming: [], ended: [] };
  }
}

export type LiveSummary = { available: boolean; liveCount: number; next: CollectibleView | null };

/** Resumo leve para o selo "AO VIVO" da loja e o destaque do Social (uma leitura por requisição). */
export const fetchLiveSummary = cache(async (): Promise<LiveSummary> => {
  try {
    const supabase = await createClient();
    const now = Date.now();
    const { data, error } = await supabase
      .from("collectibles")
      .select(ITEM_SELECT)
      .in("status", ["scheduled", "live"])
      .gt("ends_at", new Date(now).toISOString())
      .order("ends_at", { ascending: true })
      .limit(20);
    if (error || !data) return { available: false, liveCount: 0, next: null };
    const live = (data as unknown as ItemRow[]).map(toView).filter((i) => phaseOf(i, now) === "live");
    return { available: true, liveCount: live.length, next: live[0] ?? null };
  } catch {
    return { available: false, liveCount: 0, next: null };
  }
});

/** Item + últimos lances (públicos). null se não existe/indisponível ou é rascunho para quem não é admin. */
export async function fetchCollectible(supabase: Client, id: string): Promise<{ item: CollectibleView; bids: PublicBid[] } | null> {
  try {
    const [itemRes, bidsRes] = await Promise.all([
      supabase.from("collectibles").select(ITEM_SELECT).eq("id", id).maybeSingle(),
      supabase.from("collectible_bids").select("id, amount_cents, bidder_label, created_at").eq("collectible_id", id).order("amount_cents", { ascending: false }).limit(30),
    ]);
    if (itemRes.error || !itemRes.data) return null;
    return {
      item: toView(itemRes.data as unknown as ItemRow),
      bids: (bidsRes.data ?? []).map((b) => ({ id: b.id, amountCents: b.amount_cents, label: b.bidder_label, createdAt: b.created_at })),
    };
  } catch {
    return null;
  }
}

/** Os lances da própria pessoa (RLS: só os dela) e o resultado se ela venceu. */
export async function fetchMyCollectibleState(supabase: Client, id: string): Promise<MyCollectibleState> {
  try {
    const [ownersRes, resultRes] = await Promise.all([
      supabase.from("collectible_bid_owners").select("bid_id").eq("collectible_id", id),
      supabase.from("collectible_results").select("outcome").eq("collectible_id", id).maybeSingle(),
    ]);
    const result = resultRes.data;
    return {
      bidIds: (ownersRes.data ?? []).map((o) => o.bid_id),
      won: result?.outcome === "won",
    };
  } catch {
    return EMPTY_MINE;
  }
}

/** Encerramento preguiçoso: quem está logado e abre um item vencido grava o resultado (idempotente). */
export async function finalizeIfDue(supabase: Client, item: CollectibleView, signedIn: boolean): Promise<boolean> {
  if (!signedIn || item.finalizedAt || phaseOf(item) !== "ended" || item.status === "ended" || item.status === "cancelled") return false;
  const { error } = await supabase.rpc("collectible_finalize", { p_collectible: item.id });
  return !error;
}

export type MyBidRow = {
  item: CollectibleView;
  myTopCents: number;
  myBidIds: string[];
  won: boolean;
};

/** "Lances e arremates": cada item em que a pessoa deu lance, com o maior lance dela e o resultado. */
export async function fetchMyBids(supabase: Client): Promise<{ available: boolean; rows: MyBidRow[] }> {
  try {
    const { data: owners, error } = await supabase
      .from("collectible_bid_owners")
      .select("bid_id, collectible_id, bid:collectible_bids(amount_cents)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { available: false, rows: [] };
    const byItem = new Map<string, { ids: string[]; top: number }>();
    for (const row of (owners ?? []) as unknown as { bid_id: string; collectible_id: string; bid: { amount_cents: number } | null }[]) {
      const entry = byItem.get(row.collectible_id) ?? { ids: [], top: 0 };
      entry.ids.push(row.bid_id);
      entry.top = Math.max(entry.top, row.bid?.amount_cents ?? 0);
      byItem.set(row.collectible_id, entry);
    }
    const ids = [...byItem.keys()];
    if (ids.length === 0) return { available: true, rows: [] };
    const [itemsRes, resultsRes] = await Promise.all([
      supabase.from("collectibles").select(ITEM_SELECT).in("id", ids),
      supabase.from("collectible_results").select("collectible_id, outcome").in("collectible_id", ids),
    ]);
    if (itemsRes.error) return { available: false, rows: [] };
    const results = new Map((resultsRes.data ?? []).map((r) => [r.collectible_id, r]));
    const rows = ((itemsRes.data ?? []) as unknown as ItemRow[]).map((row) => {
      const item = toView(row);
      const mine = byItem.get(item.id)!;
      const result = results.get(item.id);
      return {
        item,
        myTopCents: mine.top,
        myBidIds: mine.ids,
        won: result?.outcome === "won",
      };
    });
    // ao vivo primeiro (acaba antes no topo), depois os encerrados mais recentes
    const now = Date.now();
    rows.sort((a, b) => {
      const la = phaseOf(a.item, now) === "live" ? 0 : 1;
      const lb = phaseOf(b.item, now) === "live" ? 0 : 1;
      if (la !== lb) return la - lb;
      return la === 0 ? Date.parse(a.item.endsAt ?? "") - Date.parse(b.item.endsAt ?? "") : Date.parse(b.item.endsAt ?? "") - Date.parse(a.item.endsAt ?? "");
    });
    return { available: true, rows };
  } catch {
    return { available: false, rows: [] };
  }
}

/** Itens ao vivo ou agendados de um herói (banner na página dele). */
export async function fetchHeroCollectibles(supabase: Client, creatorId: string): Promise<CollectibleView[]> {
  try {
    const now = Date.now();
    const { data, error } = await supabase
      .from("collectibles")
      .select(ITEM_SELECT)
      .eq("creator_id", creatorId)
      .in("status", ["scheduled", "live"])
      .gt("ends_at", new Date(now).toISOString())
      .order("ends_at", { ascending: true })
      .limit(3);
    if (error || !data) return [];
    return (data as unknown as ItemRow[]).map(toView);
  } catch {
    return [];
  }
}
