import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { brandStatus, isDealStage, type BrandStatus, type DealOutcome, type DealStage } from "./stages";
import { REASON_CODES, type DealTalentStatus, type DeliverableKind, type DeliverableStatus, type Reason } from "./vocab";

// Leituras do núcleo comercial (RLS decide o que cada um vê). Sem a 0066: { available: false }.

export type DealListItem = {
  id: string;
  title: string;
  stage: DealStage;
  outcome: DealOutcome | null;
  stageChangedAt: string;
  brand: { id: string; name: string; logoUrl: string | null };
  ownerId: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  requestId: string | null;
  talentCount: number;
  isDemo: boolean;
};

export type DealDetail = DealListItem & {
  talentBrief: string;
  segmentIds: string[];
  brandVisible: boolean;
  confirmedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  team: string[];
};

export type DealTalentRow = {
  id: string;
  talentId: string;
  status: DealTalentStatus;
  termsReady: boolean;
  consultedAt: string | null;
  respondBy: string | null;
  respondedAt: string | null;
  responseNote: string;
  responseChannel: string | null;
  reasons: Reason[];
  talent: { name: string; city: string | null; state: string | null; availability: string; hasLogin: boolean; avatarUrl: string | null; consentActive: boolean };
};

export type DeliverableRow = {
  id: string;
  dealTalentId: string;
  talentId: string;
  kind: DeliverableKind;
  network: string | null;
  title: string;
  brief: string;
  dueAt: string | null;
  publishAt: string | null;
  status: DeliverableStatus;
};

export type ActivityRow = { id: string; kind: string; body: string; occurredAt: string; authorLabel: string; reasonCodes: string[] };
export type MessageRow = { id: string; channel: "brand_agency" | "talent_agency"; talentId: string | null; authorSide: "agency" | "brand" | "talent"; authorLabel: string; body: string; createdAt: string };

export type RequestRow = {
  id: string;
  title: string;
  objective: string | null;
  product: string;
  targetAudience: string;
  targetAgeBands: string[];
  targetStates: string[];
  regionNote: string;
  periodStart: string | null;
  periodEnd: string | null;
  desiredAt: string | null;
  durationMinutes: number | null;
  format: string | null;
  location: string;
  networks: string[];
  deliverables: { kind: string; quantity: number; network?: string | null }[];
  notes: string;
  status: string;
  origin: "brand" | "agency";
  talentId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DealRow = {
  id: string;
  title: string;
  stage: string;
  outcome: string | null;
  stage_changed_at: string;
  owner_id: string | null;
  expected_start: string | null;
  expected_end: string | null;
  request_id: string | null;
  is_demo: boolean;
  brand: { id: string; name: string; logo_url: string | null } | null;
  deal_talents: { id: string; status: string }[] | null;
};

const DEAL_SELECT = "id, title, stage, outcome, stage_changed_at, owner_id, expected_start, expected_end, request_id, is_demo, brand:brands!deals_brand_fk(id, name, logo_url), deal_talents(id, status)";

function toDeal(r: DealRow): DealListItem {
  return {
    id: r.id,
    title: r.title,
    stage: isDealStage(r.stage) ? r.stage : "briefing_received",
    outcome: (r.outcome as DealOutcome | null) ?? null,
    stageChangedAt: r.stage_changed_at,
    brand: { id: r.brand?.id ?? "", name: r.brand?.name ?? "", logoUrl: r.brand?.logo_url ?? null },
    ownerId: r.owner_id,
    expectedStart: r.expected_start,
    expectedEnd: r.expected_end,
    requestId: r.request_id,
    talentCount: (r.deal_talents ?? []).filter((t) => !["declined", "removed"].includes(t.status)).length,
    isDemo: r.is_demo,
  };
}

export type DealFilters = { owner?: string; brand?: string; closed?: boolean };

export async function listDeals(agencyId: string, filters: DealFilters = {}): Promise<{ available: boolean; items: DealListItem[] }> {
  const supabase = await createClient();
  let query = supabase.from("deals").select(DEAL_SELECT).eq("agency_id", agencyId).order("stage_changed_at", { ascending: false }).limit(500);
  query = filters.closed ? query.eq("stage", "closed") : query.neq("stage", "closed");
  if (filters.owner === "me") query = query; // filtrado depois (precisa do usuário)
  else if (filters.owner === "none") query = query.is("owner_id", null);
  else if (filters.owner && /^[0-9a-f-]{36}$/i.test(filters.owner)) query = query.eq("owner_id", filters.owner);
  if (filters.brand && /^[0-9a-f-]{36}$/i.test(filters.brand)) query = query.eq("brand_id", filters.brand);
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as unknown as DealRow[]).map(toDeal) };
}

export async function getDeal(agencyId: string, id: string): Promise<DealDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(`${DEAL_SELECT}, talent_brief, segment_ids, brand_visible, confirmed_at, closed_at, created_at, deal_team(user_id)`)
    .eq("agency_id", agencyId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as DealRow & { talent_brief: string; segment_ids: string[]; brand_visible: boolean; confirmed_at: string | null; closed_at: string | null; created_at: string; deal_team: { user_id: string }[] | null };
  return {
    ...toDeal(r),
    talentBrief: r.talent_brief,
    segmentIds: r.segment_ids,
    brandVisible: r.brand_visible,
    confirmedAt: r.confirmed_at,
    closedAt: r.closed_at,
    createdAt: r.created_at,
    team: (r.deal_team ?? []).map((t) => t.user_id),
  };
}

export async function listDealTalents(dealId: string): Promise<DealTalentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_talents")
    .select("id, talent_id, status, terms_ready, consulted_at, respond_by, responded_at, response_note, response_channel, reasons, created_at, talent:talent_profiles!deal_talents_talent_fk(display_name, city, state, availability, user_id, creator_id, consent_at, consent_revoked_at, creator:creator_profiles(avatar_url))")
    .eq("deal_id", dealId)
    .order("created_at");
  if (error) return [];
  type Row = {
    id: string; talent_id: string; status: string; terms_ready: boolean; consulted_at: string | null; respond_by: string | null; responded_at: string | null;
    response_note: string; response_channel: string | null; reasons: unknown;
    talent: { display_name: string; city: string | null; state: string | null; availability: string; user_id: string | null; creator_id: string | null; consent_at: string | null; consent_revoked_at: string | null; creator: { avatar_url: string | null } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    talentId: r.talent_id,
    status: r.status as DealTalentStatus,
    termsReady: r.terms_ready,
    consultedAt: r.consulted_at,
    respondBy: r.respond_by,
    respondedAt: r.responded_at,
    responseNote: r.response_note,
    responseChannel: r.response_channel,
    reasons: Array.isArray(r.reasons)
      ? (r.reasons as { code?: unknown; met?: unknown; detail?: unknown }[])
          .filter((x): x is { code: Reason["code"]; met: boolean; detail: unknown } => (REASON_CODES as readonly string[]).includes(String(x?.code)) && typeof x.met === "boolean")
          .map((x) => ({ code: x.code, met: x.met, detail: Array.isArray(x.detail) ? x.detail.map(String).slice(0, 5) : [] }))
      : [],
    talent: {
      name: r.talent?.display_name ?? "",
      city: r.talent?.city ?? null,
      state: r.talent?.state ?? null,
      availability: r.talent?.availability ?? "available",
      hasLogin: Boolean(r.talent?.user_id || r.talent?.creator_id),
      avatarUrl: r.talent?.creator?.avatar_url ?? null,
      consentActive: Boolean(r.talent?.consent_at) && !r.talent?.consent_revoked_at,
    },
  }));
}

/** Cachês do negócio (tabela de valor: só o Adm recebe linhas; os outros, lista vazia). */
export async function listDealFees(dealId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("deal_talent_fees").select("deal_talent_id, fee_cents").eq("deal_id", dealId);
  return Object.fromEntries((data ?? []).map((f) => [f.deal_talent_id, f.fee_cents]));
}

export async function listDeliverables(dealId: string): Promise<DeliverableRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("id, deal_talent_id, talent_id, kind, network, title, brief, due_at, publish_at, status")
    .eq("deal_id", dealId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []).map((d) => ({
    id: d.id,
    dealTalentId: d.deal_talent_id,
    talentId: d.talent_id,
    kind: d.kind as DeliverableKind,
    network: d.network,
    title: d.title,
    brief: d.brief,
    dueAt: d.due_at,
    publishAt: d.publish_at,
    status: d.status as DeliverableStatus,
  }));
}

export async function listActivities(dealId: string): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").select("id, kind, body, occurred_at, author_label, reason_codes").eq("deal_id", dealId).order("occurred_at", { ascending: false }).limit(100);
  if (error) return [];
  return (data ?? []).map((a) => ({ id: a.id, kind: a.kind, body: a.body, occurredAt: a.occurred_at, authorLabel: a.author_label, reasonCodes: a.reason_codes }));
}

export async function listMessages(dealId: string, channel?: "brand_agency" | "talent_agency", talentId?: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  let query = supabase.from("deal_messages").select("id, channel, talent_id, author_side, author_label, body, created_at").eq("deal_id", dealId).order("created_at").limit(200);
  if (channel) query = query.eq("channel", channel);
  if (talentId) query = query.eq("talent_id", talentId);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((m) => ({
    id: m.id,
    channel: m.channel as MessageRow["channel"],
    talentId: m.talent_id,
    authorSide: m.author_side as MessageRow["authorSide"],
    authorLabel: m.author_label,
    body: m.body,
    createdAt: m.created_at,
  }));
}

function toRequest(r: Record<string, unknown>): RequestRow {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    objective: (r.objective as string | null) ?? null,
    product: String(r.product ?? ""),
    targetAudience: String(r.target_audience ?? ""),
    targetAgeBands: (r.target_age_bands as string[]) ?? [],
    targetStates: (r.target_states as string[]) ?? [],
    regionNote: String(r.region_note ?? ""),
    periodStart: (r.period_start as string | null) ?? null,
    periodEnd: (r.period_end as string | null) ?? null,
    desiredAt: (r.desired_at as string | null) ?? null,
    durationMinutes: (r.duration_minutes as number | null) ?? null,
    format: (r.format as string | null) ?? null,
    location: String(r.location ?? ""),
    networks: (r.networks as string[]) ?? [],
    deliverables: Array.isArray(r.deliverables) ? (r.deliverables as RequestRow["deliverables"]) : [],
    notes: String(r.notes ?? ""),
    status: String(r.status ?? "draft"),
    origin: (r.origin as "brand" | "agency") ?? "brand",
    talentId: (r.talent_id as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

const REQUEST_SELECT = "id, title, objective, product, target_audience, target_age_bands, target_states, region_note, period_start, period_end, desired_at, duration_minutes, format, location, networks, deliverables, notes, status, origin, talent_id, submitted_at, created_at, updated_at";

export async function getRequest(id: string): Promise<RequestRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaign_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toRequest(data as unknown as Record<string, unknown>);
}

/** Orçamento oferecido pela marca (tabela de valor: só a marca dona e o Adm recebem a linha). */
export async function getRequestBudget(requestId: string): Promise<{ min: number | null; max: number | null; note: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaign_request_budgets").select("budget_min_cents, budget_max_cents, note").eq("request_id", requestId).maybeSingle();
  return data ? { min: data.budget_min_cents, max: data.budget_max_cents, note: data.note } : null;
}

// ---------------------------------------------------------------- marca
export type BrandCampaignItem = {
  requestId: string;
  title: string;
  status: BrandStatus;
  updatedAt: string;
  periodStart: string | null;
  dealId: string | null;
  talentName: string | null;
};

export async function listBrandCampaigns(brandId: string): Promise<{ available: boolean; items: BrandCampaignItem[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaign_requests")
    .select("id, title, status, updated_at, period_start, talent_id, deals(id, stage, outcome)")
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return { available: !isMissingSchema(error), items: [] };
  type Row = { id: string; title: string; status: string; updated_at: string; period_start: string | null; talent_id: string | null; deals: { id: string; stage: string; outcome: string | null } | { id: string; stage: string; outcome: string | null }[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const talentIds = Array.from(new Set(rows.map((r) => r.talent_id).filter((t): t is string => Boolean(t))));
  // nomes dos creators desejados pelo cartão autorizado (a marca não lê talent_profiles direto)
  const names = new Map<string, string>();
  for (const talentId of talentIds) {
    const { data: card } = await supabase.rpc("brand_talent_detail", { p_brand: brandId, p_talent: talentId });
    const name = card && typeof card === "object" && !Array.isArray(card) ? (card as { name?: string }).name : undefined;
    if (name) names.set(talentId, name);
  }
  return {
    available: true,
    items: rows.map((r) => {
      const deal = Array.isArray(r.deals) ? r.deals[0] : r.deals;
      const status: BrandStatus = deal && isDealStage(deal.stage) ? brandStatus(deal.stage, (deal.outcome as DealOutcome | null) ?? null) : r.status === "cancelled" ? "cancelled" : "draft";
      return { requestId: r.id, title: r.title || "—", status, updatedAt: r.updated_at, periodStart: r.period_start, dealId: deal?.id ?? null, talentName: r.talent_id ? (names.get(r.talent_id) ?? null) : null };
    }),
  };
}

export type BrandCampaignDetail = {
  request: RequestRow;
  brandStatus: BrandStatus;
  deal: { id: string; title: string; stageChangedAt: string; expectedStart: string | null; expectedEnd: string | null; confirmedAt: string | null; closedAt: string | null; outcome: string | null } | null;
  requestedTalent: TalentCard | null;
  talents: (TalentCard & { dealTalentId: string; status: string })[];
  deliverables: { id: string; kind: string; network: string | null; title: string; dueAt: string | null; publishAt: string | null; status: string; talentName: string }[];
};

export type TalentCard = {
  id: string;
  name: string;
  availability: string;
  photoUrl?: string | null;
  headline?: string;
  about?: string;
  city?: string | null;
  state?: string | null;
  segments?: { id: string; name: string }[];
  networks?: {
    network: string; handle: string; url?: string | null; source: string; as_of: string; declared_side: "talent" | "agency" | "integration"; declared_at?: string | null;
    followers?: number | null; avg_views?: number | null; avg_reach?: number | null; engagement_bp?: number | null; audience?: unknown;
  }[];
  brands?: { name: string; logo_url: string | null }[];
  hasPublicPage: boolean;
  heroSlug?: string | null;
  matched?: string[];
  insufficientData?: boolean;
  availabilityPeriods?: { startsOn: string; endsOn: string; note: string }[];
  blockedPeriods?: { startsOn: string; endsOn: string }[];
  agency?: { id: string; name: string } | null;
};

function toCard(raw: Record<string, unknown>): TalentCard {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    availability: String(raw.availability ?? "available"),
    photoUrl: (raw.photo_url as string | null | undefined) ?? null,
    headline: raw.headline as string | undefined,
    about: raw.about as string | undefined,
    city: raw.city as string | null | undefined,
    state: raw.state as string | null | undefined,
    segments: raw.segments as TalentCard["segments"],
    networks: raw.networks as TalentCard["networks"],
    brands: raw.brands as TalentCard["brands"],
    hasPublicPage: Boolean(raw.has_public_page),
    heroSlug: (raw.hero_slug as string | null | undefined) ?? null,
    matched: Array.isArray(raw.matched) ? (raw.matched as string[]) : undefined,
    insufficientData: raw.insufficient_data === true,
    availabilityPeriods: Array.isArray(raw.availability_periods)
      ? (raw.availability_periods as { starts_on: string; ends_on: string; note: string }[]).map((p) => ({ startsOn: p.starts_on, endsOn: p.ends_on, note: p.note }))
      : undefined,
    blockedPeriods: Array.isArray(raw.blocked_periods) ? (raw.blocked_periods as { starts_on: string; ends_on: string }[]).map((p) => ({ startsOn: p.starts_on, endsOn: p.ends_on })) : undefined,
    agency: (raw.agency as TalentCard["agency"]) ?? null,
  };
}

export type SearchFilters = { q?: string; segment?: string; state?: string; network?: string; minFollowers?: number; availability?: string };

export async function searchTalentsForBrand(brandId: string, filters: SearchFilters): Promise<{ available: boolean; items: TalentCard[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_talent_search", {
    p_brand: brandId,
    p_filters: { q: filters.q ?? "", segment_id: filters.segment ?? "", state: filters.state ?? "", network: filters.network ?? "", min_followers: filters.minFollowers ?? "", availability: filters.availability ?? "" },
  });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: Array.isArray(data) ? (data as Record<string, unknown>[]).map(toCard) : [] };
}

export async function getTalentForBrand(brandId: string, talentId: string): Promise<TalentCard | null> {
  if (!/^[0-9a-f-]{36}$/i.test(talentId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_talent_detail", { p_brand: brandId, p_talent: talentId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  return toCard(data as Record<string, unknown>);
}

export async function getBrandCampaign(requestId: string): Promise<BrandCampaignDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_campaign_detail", { p_request: requestId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  const deal = raw.deal as Record<string, unknown> | null;
  return {
    request: toRequest(raw.request as Record<string, unknown>),
    brandStatus: (raw.brand_status as BrandStatus) ?? "draft",
    deal: deal
      ? { id: String(deal.id), title: String(deal.title), stageChangedAt: String(deal.stage_changed_at), expectedStart: (deal.expected_start as string | null) ?? null, expectedEnd: (deal.expected_end as string | null) ?? null, confirmedAt: (deal.confirmed_at as string | null) ?? null, closedAt: (deal.closed_at as string | null) ?? null, outcome: (deal.outcome as string | null) ?? null }
      : null,
    requestedTalent: raw.requested_talent ? toCard(raw.requested_talent as Record<string, unknown>) : null,
    talents: Array.isArray(raw.talents) ? (raw.talents as Record<string, unknown>[]).map((t) => ({ ...toCard(t), dealTalentId: String(t.deal_talent_id), status: String(t.status) })) : [],
    deliverables: Array.isArray(raw.deliverables)
      ? (raw.deliverables as Record<string, unknown>[]).map((d) => ({ id: String(d.id), kind: String(d.kind), network: (d.network as string | null) ?? null, title: String(d.title ?? ""), dueAt: (d.due_at as string | null) ?? null, publishAt: (d.publish_at as string | null) ?? null, status: String(d.status), talentName: String(d.talent_name ?? "") }))
      : [],
  };
}

// ---------------------------------------------------------------- creator (escritório)
export type Opportunity = {
  id: string;
  status: DealTalentStatus;
  consultedAt: string | null;
  respondBy: string | null;
  respondedAt: string | null;
  responseNote: string;
  termsReady: boolean;
  deal: { id: string; title: string; talentBrief: string; expectedStart: string | null; expectedEnd: string | null; status: string; confirmedAt: string | null };
  request: { objective: string | null; product: string; desiredAt: string | null; durationMinutes: number | null; format: string | null; location: string; networks: string[]; deliverables: RequestRow["deliverables"]; notes: string } | null;
  brand: { id: string; name: string; logoUrl: string | null };
  deliverables: { id: string; kind: string; network: string | null; title: string; brief: string; dueAt: string | null; publishAt: string | null; status: string }[];
};

export async function listOpportunities(dealTalentId?: string): Promise<{ available: boolean; items: Opportunity[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_opportunities", { p_deal_talent: dealTalentId ?? null });
  if (error) return { available: !isMissingSchema(error), items: [] };
  if (!Array.isArray(data)) return { available: true, items: [] };
  return {
    available: true,
    items: (data as Record<string, unknown>[]).map((o) => {
      const deal = o.deal as Record<string, unknown>;
      const req = (o.request as Record<string, unknown> | null) ?? null;
      const brand = o.brand as Record<string, unknown>;
      return {
        id: String(o.id),
        status: o.status as DealTalentStatus,
        consultedAt: (o.consulted_at as string | null) ?? null,
        respondBy: (o.respond_by as string | null) ?? null,
        respondedAt: (o.responded_at as string | null) ?? null,
        responseNote: String(o.response_note ?? ""),
        termsReady: Boolean(o.terms_ready),
        deal: { id: String(deal.id), title: String(deal.title), talentBrief: String(deal.talent_brief ?? ""), expectedStart: (deal.expected_start as string | null) ?? null, expectedEnd: (deal.expected_end as string | null) ?? null, status: String(deal.status), confirmedAt: (deal.confirmed_at as string | null) ?? null },
        request: req
          ? { objective: (req.objective as string | null) ?? null, product: String(req.product ?? ""), desiredAt: (req.desired_at as string | null) ?? null, durationMinutes: (req.duration_minutes as number | null) ?? null, format: (req.format as string | null) ?? null, location: String(req.location ?? ""), networks: (req.networks as string[]) ?? [], deliverables: Array.isArray(req.deliverables) ? (req.deliverables as RequestRow["deliverables"]) : [], notes: String(req.notes ?? "") }
          : null,
        brand: { id: String(brand.id), name: String(brand.name), logoUrl: (brand.logo_url as string | null) ?? null },
        deliverables: Array.isArray(o.deliverables)
          ? (o.deliverables as Record<string, unknown>[]).map((d) => ({ id: String(d.id), kind: String(d.kind), network: (d.network as string | null) ?? null, title: String(d.title ?? ""), brief: String(d.brief ?? ""), dueAt: (d.due_at as string | null) ?? null, publishAt: (d.publish_at as string | null) ?? null, status: String(d.status) }))
          : [],
      };
    }),
  };
}

/** Cachê do próprio creator (tabela de valor: a RLS só devolve depois de consultado; só na web). */
export async function myFee(dealTalentId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("deal_talent_fees").select("fee_cents").eq("deal_talent_id", dealTalentId).maybeSingle();
  return data?.fee_cents ?? null;
}

export type AvailabilityRow = { id: string; kind: "available" | "blocked"; startsOn: string; endsOn: string; note: string };

export async function listAvailability(talentId: string): Promise<AvailabilityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("talent_availability").select("id, kind, starts_on, ends_on, note").eq("talent_id", talentId).order("starts_on");
  if (error) return [];
  return (data ?? []).map((a) => ({ id: a.id, kind: a.kind as "available" | "blocked", startsOn: a.starts_on, endsOn: a.ends_on, note: a.note }));
}

/** Contagens do Início da agência (sem valor). */
export async function dealCounts(agencyId: string): Promise<{ open: number; awaitingAgency: number; awaitingCreator: number; confirmed: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deals").select("id, stage, deal_talents(status)").eq("agency_id", agencyId).neq("stage", "closed");
  if (error) return null;
  type Row = { id: string; stage: string; deal_talents: { status: string }[] | null };
  const rows = (data ?? []) as unknown as Row[];
  return {
    open: rows.length,
    awaitingAgency: rows.filter((r) => ["briefing_received", "qualification"].includes(r.stage) || (r.deal_talents ?? []).some((t) => ["interested", "talk_requested"].includes(t.status))).length,
    awaitingCreator: rows.filter((r) => (r.deal_talents ?? []).some((t) => t.status === "consulted")).length,
    confirmed: rows.filter((r) => isDealStage(r.stage) && ["approved", "contracting", "production", "approval", "delivery"].includes(r.stage)).length,
  };
}
