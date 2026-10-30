import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { pickSuggested, type OrderStatus, type ProfessionalStatus, type ServiceKind, type ServiceMode, type Specialty } from "./rules";

// Leituras de profissionais e serviços (0058), sempre sob a RLS da sessão. Sem a 0058 no banco
// (tabela ausente) tudo volta "indisponível" e as telas escondem o recurso (o E2E roda contra o
// banco remoto, que pode não ter a migração).

type Client = SupabaseClient<Database>;

export type ProfessionalCardView = {
  id: string;
  slug: string;
  name: string;
  photoUrl: string | null;
  specialty: Specialty;
  registryType: string;
  registryNumber: string;
  registryUf: string;
  registryVerified: boolean;
  bio: string;
  cities: string[];
  online: boolean;
  status: ProfessionalStatus;
  userId: string | null;
  /** Menor preço entre os serviços ativos (centavos), quando carregado. */
  fromCents: number | null;
};

export type ServiceView = {
  id: string;
  professionalId: string;
  title: string;
  description: string;
  kind: ServiceKind;
  mode: ServiceMode;
  durationMinutes: number | null;
  planWeeks: number | null;
  priceCents: number;
  isActive: boolean;
  adminDisabled: boolean;
  sortOrder: number;
};

export const PRO_SELECT =
  "id, slug, name, photo_url, specialty, registry_type, registry_number, registry_uf, registry_verified, bio, cities, online, status, user_id";
export const SERVICE_SELECT = "id, professional_id, title, description, kind, mode, duration_minutes, plan_weeks, price_cents, is_active, admin_disabled, sort_order";

type ProRow = {
  id: string;
  slug: string;
  name: string;
  photo_url: string | null;
  specialty: string;
  registry_type: string;
  registry_number: string;
  registry_uf: string;
  registry_verified: boolean;
  bio: string;
  cities: string[] | null;
  online: boolean;
  status: string;
  user_id: string | null;
};

type ServiceRow = {
  id: string;
  professional_id: string;
  title: string;
  description: string;
  kind: string;
  mode: string;
  duration_minutes: number | null;
  plan_weeks: number | null;
  price_cents: number;
  is_active: boolean;
  admin_disabled: boolean;
  sort_order: number;
};

export function toProfessional(row: ProRow, fromCents: number | null = null): ProfessionalCardView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    photoUrl: row.photo_url,
    specialty: row.specialty as Specialty,
    registryType: row.registry_type,
    registryNumber: row.registry_number,
    registryUf: row.registry_uf,
    registryVerified: row.registry_verified,
    bio: row.bio,
    cities: row.cities ?? [],
    online: row.online,
    status: row.status as ProfessionalStatus,
    userId: row.user_id,
    fromCents,
  };
}

export function toService(row: ServiceRow): ServiceView {
  return {
    id: row.id,
    professionalId: row.professional_id,
    title: row.title,
    description: row.description,
    kind: row.kind as ServiceKind,
    mode: row.mode as ServiceMode,
    durationMinutes: row.duration_minutes,
    planWeeks: row.plan_weeks,
    priceCents: row.price_cents,
    isActive: row.is_active,
    adminDisabled: row.admin_disabled,
    sortOrder: row.sort_order,
  };
}

/** Menor preço de serviço ativo por profissional (a RLS pública já esconde os inativos). */
async function fromPrices(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data } = await supabase.from("professional_services").select("professional_id, price_cents").in("professional_id", ids).eq("is_active", true).eq("admin_disabled", false);
  for (const row of data ?? []) {
    const prev = out.get(row.professional_id);
    if (prev === undefined || row.price_cents < prev) out.set(row.professional_id, row.price_cents);
  }
  return out;
}

export type PublicList = { available: boolean; items: ProfessionalCardView[] };

/** Lista pública (/profissionais): só aprovados (RLS), filtro opcional por especialidade. */
export async function listPublicProfessionals(specialty: Specialty | null): Promise<PublicList> {
  try {
    const supabase = await createClient();
    let query = supabase.from("professionals").select(PRO_SELECT).eq("status", "approved").order("sort_order").order("name").limit(100);
    if (specialty) query = query.eq("specialty", specialty);
    const { data, error } = await query;
    if (error) return { available: false, items: [] };
    const rows = (data ?? []) as ProRow[];
    const prices = await fromPrices(supabase, rows.map((r) => r.id));
    return { available: true, items: rows.map((r) => toProfessional(r, prices.get(r.id) ?? null)) };
  } catch {
    return { available: false, items: [] };
  }
}

export type PublicProfile = { professional: ProfessionalCardView; services: ServiceView[] };

/** Página pública: perfil aprovado + serviços ativos. null = não existe (ou não aprovado, ou sem a 0058). */
export const getPublicProfessional = cache(async (slug: string): Promise<PublicProfile | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("professionals").select(PRO_SELECT).eq("slug", slug).eq("status", "approved").maybeSingle();
    if (error || !data) return null;
    const { data: services } = await supabase
      .from("professional_services")
      .select(SERVICE_SELECT)
      .eq("professional_id", data.id)
      .eq("is_active", true)
      .eq("admin_disabled", false)
      .order("sort_order")
      .order("price_cents");
    const list = ((services ?? []) as ServiceRow[]).map(toService);
    const from = list.length ? Math.min(...list.map((s) => s.priceCents)) : null;
    return { professional: toProfessional(data as ProRow, from), services: list };
  } catch {
    return null;
  }
});

export type SuggestedNutritionists = { available: boolean; items: (ProfessionalCardView & { services: ServiceView[] })[]; source: "recipe" | "hero" | "any" | null };

/**
 * "Contratar nutricionista" (receita e Alimentação): sugeridos da receita, depois do herói, depois
 * qualquer nutricionista aprovado. Traz os serviços ativos de cada um (para o botão Contratar).
 */
export async function suggestedNutritionists(input: { contentId: string | null; creatorId: string | null; limit?: number }): Promise<SuggestedNutritionists> {
  const empty: SuggestedNutritionists = { available: false, items: [], source: null };
  try {
    const supabase = await createClient();
    const byTarget = async (column: "content_id" | "creator_id", id: string | null): Promise<string[]> => {
      if (!id) return [];
      const { data } = await supabase.from("professional_suggestions").select("professional_id").eq(column, id);
      return (data ?? []).map((r) => r.professional_id);
    };
    const [recipeIds, heroIds] = await Promise.all([byTarget("content_id", input.contentId), byTarget("creator_id", input.creatorId)]);
    const { data, error } = await supabase.from("professionals").select(PRO_SELECT).eq("status", "approved").eq("specialty", "nutritionist").order("sort_order").limit(30);
    if (error) return empty;
    const rows = ((data ?? []) as ProRow[]).map((r) => toProfessional(r));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pick = pickSuggested(
      {
        recipe: recipeIds.map((id) => byId.get(id)).filter((p): p is ProfessionalCardView => Boolean(p)),
        hero: heroIds.map((id) => byId.get(id)).filter((p): p is ProfessionalCardView => Boolean(p)),
        any: rows,
      },
      input.limit ?? 2,
    );
    if (pick.items.length === 0) return { available: true, items: [], source: null };
    const { data: services } = await supabase
      .from("professional_services")
      .select(SERVICE_SELECT)
      .in("professional_id", pick.items.map((p) => p.id))
      .eq("is_active", true)
      .eq("admin_disabled", false)
      .order("sort_order")
      .order("price_cents");
    const svc = ((services ?? []) as ServiceRow[]).map(toService);
    return {
      available: true,
      source: pick.source,
      items: pick.items.map((p) => {
        const mine = svc.filter((s) => s.professionalId === p.id);
        return { ...p, services: mine, fromCents: mine.length ? Math.min(...mine.map((s) => s.priceCents)) : null };
      }),
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------- carrinho
export type ServiceCartLine = {
  id: string;
  serviceId: string;
  priceSeenCents: number;
  /** null = serviço saiu do ar (desativado, profissional suspenso). */
  service: (ServiceView & { professional: { id: string; slug: string; name: string; specialty: Specialty } | null }) | null;
};

export type ServiceCart = { available: boolean; lines: ServiceCartLine[] };

export async function loadServiceCart(): Promise<ServiceCart> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("service_cart_items").select("id, service_id, price_cents_seen, added_at").order("added_at");
    if (error) return { available: false, lines: [] };
    const rows = data ?? [];
    if (rows.length === 0) return { available: true, lines: [] };
    const { data: services } = await supabase
      .from("professional_services")
      .select(`${SERVICE_SELECT}, professional:professionals(id, slug, name, specialty, status)`)
      .in("id", rows.map((r) => r.service_id))
      .eq("is_active", true)
      .eq("admin_disabled", false);
    type Joined = ServiceRow & { professional: { id: string; slug: string; name: string; specialty: string; status: string } | null };
    const map = new Map(((services ?? []) as unknown as Joined[]).filter((s) => s.professional?.status === "approved").map((s) => [s.id, s]));
    return {
      available: true,
      lines: rows.map((r) => {
        const s = map.get(r.service_id);
        return {
          id: r.id,
          serviceId: r.service_id,
          priceSeenCents: r.price_cents_seen,
          service: s
            ? { ...toService(s), professional: s.professional ? { id: s.professional.id, slug: s.professional.slug, name: s.professional.name, specialty: s.professional.specialty as Specialty } : null }
            : null,
        };
      }),
    };
  } catch {
    return { available: false, lines: [] };
  }
}

/** Serviços já no carrinho (para o botão mostrar "No carrinho"). */
export async function serviceIdsInCart(): Promise<Set<string>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("service_cart_items").select("service_id");
    return new Set((data ?? []).map((r) => r.service_id));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------- pedidos
export type ServiceOrderEvent = { id: number; fromStatus: string | null; toStatus: string; actorType: string; note: string; createdAt: string };

export type ServiceOrderView = {
  id: string;
  professionalId: string;
  professional: { slug: string; name: string; specialty: Specialty } | null;
  clientLabel: string;
  title: string;
  kind: ServiceKind;
  mode: ServiceMode;
  durationMinutes: number | null;
  planWeeks: number | null;
  priceCents: number;
  status: OrderStatus;
  scheduleNote: string;
  firstResponseAt: string | null;
  closedAt: string | null;
  createdAt: string;
  events: ServiceOrderEvent[];
};

export const ORDER_SELECT =
  "id, professional_id, client_label, title_snapshot, kind_snapshot, mode_snapshot, duration_minutes_snapshot, plan_weeks_snapshot, price_cents, status, schedule_note, first_response_at, closed_at, created_at, " +
  "professional:professionals(slug, name, specialty), events:service_order_events(id, from_status, to_status, actor_type, note, created_at)";

type OrderRow = {
  id: string;
  professional_id: string;
  client_label: string;
  title_snapshot: string;
  kind_snapshot: string;
  mode_snapshot: string;
  duration_minutes_snapshot: number | null;
  plan_weeks_snapshot: number | null;
  price_cents: number;
  status: string;
  schedule_note: string;
  first_response_at: string | null;
  closed_at: string | null;
  created_at: string;
  professional: { slug: string; name: string; specialty: string } | null;
  events: { id: number; from_status: string | null; to_status: string; actor_type: string; note: string; created_at: string }[] | null;
};

export function toOrder(row: OrderRow): ServiceOrderView {
  return {
    id: row.id,
    professionalId: row.professional_id,
    professional: row.professional ? { slug: row.professional.slug, name: row.professional.name, specialty: row.professional.specialty as Specialty } : null,
    clientLabel: row.client_label,
    title: row.title_snapshot,
    kind: row.kind_snapshot as ServiceKind,
    mode: row.mode_snapshot as ServiceMode,
    durationMinutes: row.duration_minutes_snapshot,
    planWeeks: row.plan_weeks_snapshot,
    priceCents: row.price_cents,
    status: row.status as OrderStatus,
    scheduleNote: row.schedule_note,
    firstResponseAt: row.first_response_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    events: (row.events ?? [])
      .map((e) => ({ id: e.id, fromStatus: e.from_status, toStatus: e.to_status, actorType: e.actor_type, note: e.note, createdAt: e.created_at }))
      .sort((a, b) => a.id - b.id),
  };
}

/** Pedidos de serviço da pessoa (Minhas compras). */
export async function myServiceOrders(userId: string): Promise<{ available: boolean; orders: ServiceOrderView[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("service_orders").select(ORDER_SELECT).eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) return { available: false, orders: [] };
    return { available: true, orders: ((data ?? []) as unknown as OrderRow[]).map(toOrder) };
  } catch {
    return { available: false, orders: [] };
  }
}

// ---------------------------------------------------------------- portal do profissional
export type MyProfessional = { available: boolean; professional: ProfessionalCardView | null };

/** Perfil profissional ligado à conta logada (qualquer situação). */
export const getMyProfessional = cache(async (): Promise<MyProfessional> => {
  try {
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("my_professional_id");
    if (error) return { available: false, professional: null };
    if (!id) return { available: true, professional: null };
    const { data } = await supabase.from("professionals").select(PRO_SELECT).eq("id", id).maybeSingle();
    return { available: true, professional: data ? toProfessional(data as ProRow) : null };
  } catch {
    return { available: false, professional: null };
  }
});

export async function professionalServices(professionalId: string): Promise<ServiceView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("professional_services").select(SERVICE_SELECT).eq("professional_id", professionalId).order("sort_order").order("created_at");
  return ((data ?? []) as ServiceRow[]).map(toService);
}

export async function professionalOrders(professionalId: string, status?: OrderStatus | "open" | "closed" | null, limit = 100): Promise<ServiceOrderView[]> {
  const supabase = await createClient();
  let query = supabase.from("service_orders").select(ORDER_SELECT).eq("professional_id", professionalId).order("created_at", { ascending: false }).limit(limit);
  if (status === "open") query = query.in("status", ["pending", "accepted", "scheduled"]);
  else if (status === "closed") query = query.in("status", ["completed", "declined", "cancelled"]);
  else if (status) query = query.eq("status", status);
  const { data } = await query;
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

export async function serviceOrderById(id: string): Promise<ServiceOrderView | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  return data ? toOrder(data as unknown as OrderRow) : null;
}
