import "server-only";
import { toProgress, type RoadmapProgress } from "@/lib/roadmap/queries";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isRoomSide, isUuid, type FeedbackMoment, type RoomSide } from "./vocab";

// Leituras da sala do projeto (0110). Tudo por RPC: o banco decide o lado (agência, staff externo, Hero, marca), o que
// cada um vê (mensagens internas, e-mails, horários de chegada) e se o NDA ainda trava a sala.

const s = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export type RoomMember = {
  side: "agency" | "talent" | "staff" | "brand";
  name: string;
  role: string;
  id: string | null;
  email: string | null;
  userId: string | null;
  status: "pending" | "active" | null;
  expired: boolean;
  nda: boolean | null;
  ndaId: string | null;
};
export type CrewRow = { userId: string | null; name: string; role: string; side: string; checkedInAt: string | null; me: boolean };
export type ShootDay = {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string;
  mapUrl: string | null;
  parking: string;
  food: string;
  peopleLimit: number | null;
  notes: string;
  crew: CrewRow[];
  arrived: number | null;
  total: number;
};
export type RoomMessage = {
  id: string;
  kind: "text" | "system";
  audience: "all" | "internal";
  authorSide: "agency" | "brand" | "talent" | "staff" | "system";
  authorLabel: string;
  body: string;
  createdAt: string;
  mine: boolean;
  attachment: { name: string; mime: string; size: number } | null;
};
export type Feedback = { id: string; moment: FeedbackMoment; party: "brand" | "talent"; score: number | null; comment: string; answeredAt: string | null };
export type RoomDeal = { id: string; title: string; stage: string | null; outcome: string | null; agency: string; brand: string | null; talent: string | null; service: string | null };

export type RoomView =
  | { locked: "nda"; side: RoomSide; status: "open" | "archived"; deal: RoomDeal }
  | {
      locked: null;
      side: RoomSide;
      status: "open" | "archived";
      canPost: boolean;
      canInternal: boolean;
      canManage: boolean;
      isManager: boolean;
      deal: RoomDeal;
      norms: string;
      briefing: string;
      ndaHeroes: boolean;
      openedAt: string | null;
      archivedAt: string | null;
      members: RoomMember[];
      shootDays: ShootDay[];
      messages: RoomMessage[];
      usageGuide: { messageId: string; name: string } | null;
      feedback: Feedback[];
      timezone: string;
      progress: RoadmapProgress | null;
    };

function toDeal(raw: unknown): RoomDeal {
  const d = obj(raw) ?? {};
  return { id: String(d.id ?? ""), title: String(d.title ?? ""), stage: s(d.stage), outcome: s(d.outcome), agency: String(d.agency ?? ""), brand: s(d.brand), talent: s(d.talent), service: s(d.service) };
}

export function toFeedback(raw: unknown): Feedback[] {
  return arr(raw).map((f) => ({
    id: String(f.id),
    moment: f.moment === "closing" ? "closing" : "production_day",
    party: f.party === "talent" ? "talent" : "brand",
    score: n(f.score),
    comment: String(f.comment ?? ""),
    answeredAt: s(f.answered_at),
  }));
}

export function toRoomView(raw: unknown): RoomView | null {
  const r = obj(raw);
  if (!r || !isRoomSide(r.side)) return null;
  const status = r.status === "archived" ? "archived" : "open";
  if (r.locked === "nda") return { locked: "nda", side: r.side, status, deal: toDeal(r.deal) };
  const guide = obj(r.usage_guide);
  return {
    locked: null,
    side: r.side,
    status,
    canPost: r.can_post === true,
    canInternal: r.can_internal === true,
    canManage: r.can_manage === true,
    isManager: r.is_manager === true,
    deal: toDeal(r.deal),
    norms: String(r.norms ?? ""),
    briefing: String(r.briefing ?? ""),
    ndaHeroes: r.nda_heroes === true,
    openedAt: s(r.opened_at),
    archivedAt: s(r.archived_at),
    members: arr(r.members).map((m) => ({
      side: m.side === "talent" || m.side === "staff" || m.side === "brand" ? m.side : "agency",
      name: String(m.name ?? ""),
      role: String(m.role ?? ""),
      id: s(m.id),
      email: s(m.email),
      userId: s(m.user_id),
      status: m.status === "pending" || m.status === "active" ? m.status : null,
      expired: m.expired === true,
      nda: typeof m.nda === "boolean" ? m.nda : null,
      ndaId: s(m.nda_id),
    })),
    shootDays: arr(r.shoot_days).map((d) => ({
      id: String(d.id),
      startsAt: String(d.starts_at),
      endsAt: String(d.ends_at),
      location: String(d.location ?? ""),
      mapUrl: s(d.map_url),
      parking: String(d.parking ?? ""),
      food: String(d.food ?? ""),
      peopleLimit: n(d.people_limit),
      notes: String(d.notes ?? ""),
      crew: arr(d.crew).map((c) => ({ userId: s(c.user_id), name: String(c.name ?? ""), role: String(c.role ?? ""), side: String(c.side ?? ""), checkedInAt: s(c.checked_in_at), me: c.me === true })),
      arrived: n(d.arrived),
      total: n(d.total) ?? 0,
    })),
    messages: arr(r.messages).map((m) => {
      const a = obj(m.attachment);
      return {
        id: String(m.id),
        kind: m.kind === "system" ? "system" : "text",
        audience: m.audience === "internal" ? "internal" : "all",
        authorSide: (["agency", "brand", "talent", "staff", "system"].includes(String(m.author_side)) ? m.author_side : "agency") as RoomMessage["authorSide"],
        authorLabel: String(m.author_label ?? ""),
        body: String(m.body ?? ""),
        createdAt: String(m.created_at),
        mine: m.mine === true,
        attachment: a ? { name: String(a.name ?? ""), mime: String(a.mime ?? ""), size: n(a.size) ?? 0 } : null,
      };
    }),
    usageGuide: guide && s(guide.message_id) ? { messageId: String(guide.message_id), name: String(guide.name ?? "") } : null,
    feedback: toFeedback(r.feedback),
    timezone: s(r.timezone) ?? "America/Sao_Paulo",
    progress: toProgress(r.progress),
  };
}

/** Sala para quem lê. null = sem acesso (ou sala inexistente/arquivada para quem não é da agência). */
export async function getRoom(dealId: string): Promise<{ available: boolean; room: RoomView | null }> {
  if (!isUuid(dealId)) return { available: true, room: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_room_view", { p_deal: dealId });
  if (error) return { available: !isMissingSchema(error), room: null };
  return { available: true, room: toRoomView(data) };
}

export type RoomAccess = { side: RoomSide; exists: boolean; status: "open" | "archived" | null; readable: boolean; ndaNeeded: boolean };

export async function getRoomAccess(dealId: string): Promise<RoomAccess | null> {
  if (!isUuid(dealId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_room_access", { p_deal: dealId });
  const r = obj(data);
  if (error || !r || !isRoomSide(r.side)) return null;
  return { side: r.side, exists: r.exists === true, status: r.status === "open" || r.status === "archived" ? r.status : null, readable: r.readable === true, ndaNeeded: r.nda_needed === true };
}

export type MyRoom = { dealId: string; title: string; agency: string; service: string | null; side: "staff" | "talent" | "brand"; ndaNeeded: boolean; role: string | null; nextShoot: { id: string; startsAt: string; location: string } | null };

export async function getMyRooms(): Promise<{ available: boolean; items: MyRoom[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_project_rooms");
  if (error) return { available: !isMissingSchema(error), items: [] };
  return {
    available: true,
    items: arr(data).map((x) => {
      const next = obj(x.next_shoot);
      return {
        dealId: String(x.deal_id),
        title: String(x.title ?? ""),
        agency: String(x.agency ?? ""),
        service: s(x.service),
        side: x.side === "talent" || x.side === "brand" ? x.side : "staff",
        ndaNeeded: x.nda_needed === true,
        role: s(x.role),
        nextShoot: next ? { id: String(next.id), startsAt: String(next.starts_at), location: String(next.location ?? "") } : null,
      };
    }),
  };
}

// ------------------------------------------------------------------ clipping
export type ClipMetrics = { reach: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null; measuredOn: string | null };
export type ClipDeliverable = { id: string; title: string; kind: string; network: string | null; talent: string; status: string; publishedUrl: string | null; publishedAt: string | null; metrics: ClipMetrics | null };
export type Clipping = {
  side: "agency" | "brand" | "talent";
  frozen: boolean;
  roomStatus: "open" | "archived" | null;
  generatedAt: string;
  dealId: string;
  title: string;
  agency: string;
  brand: string | null;
  talent: string | null;
  service: string | null;
  serviceSlug: string | null;
  outcome: string | null;
  startedOn: string | null;
  closedOn: string | null;
  progress: RoadmapProgress | null;
  deliverables: ClipDeliverable[];
  totals: { deliverables: number; published: number; reach: number; views: number; engagement: number; clicks: number };
  team: { name: string; role: string }[];
  previews: { deliverable: string; revision: number; url: string | null; decidedAt: string | null; previewOn: string | null }[];
  usageGuide: { messageId: string; name: string } | null;
  shootDays: { startsAt: string; location: string }[];
  feedback: Feedback[];
  brandId: string | null;
  clientTalentId: string | null;
};

export async function getClipping(dealId: string): Promise<{ available: boolean; data: Clipping | null }> {
  if (!isUuid(dealId)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_clipping", { p_deal: dealId });
  if (error) return { available: !isMissingSchema(error), data: null };
  const c = obj(data);
  if (!c) return { available: true, data: null };
  const tot = obj(c.totals) ?? {};
  const guide = obj(c.usage_guide);
  return {
    available: true,
    data: {
      side: c.side === "brand" || c.side === "talent" ? c.side : "agency",
      frozen: c.frozen === true,
      roomStatus: c.room_status === "open" || c.room_status === "archived" ? c.room_status : null,
      generatedAt: String(c.generated_at ?? ""),
      dealId: String(c.deal_id ?? dealId),
      title: String(c.title ?? ""),
      agency: String(c.agency ?? ""),
      brand: s(c.brand),
      talent: s(c.talent),
      service: s(c.service),
      serviceSlug: s(c.service_slug),
      outcome: s(c.outcome),
      startedOn: s(c.started_on),
      closedOn: s(c.closed_on),
      progress: toProgress(c.progress),
      deliverables: arr(c.deliverables).map((d) => {
        const m = obj(d.metrics);
        return {
          id: String(d.id),
          title: String(d.title ?? ""),
          kind: String(d.kind ?? "other"),
          network: s(d.network),
          talent: String(d.talent ?? ""),
          status: String(d.status ?? ""),
          publishedUrl: s(d.published_url),
          publishedAt: s(d.published_at),
          metrics: m
            ? { reach: n(m.reach), views: n(m.views), likes: n(m.likes), comments: n(m.comments), shares: n(m.shares), saves: n(m.saves), clicks: n(m.clicks), measuredOn: s(m.measured_on) }
            : null,
        };
      }),
      totals: { deliverables: n(tot.deliverables) ?? 0, published: n(tot.published) ?? 0, reach: n(tot.reach) ?? 0, views: n(tot.views) ?? 0, engagement: n(tot.engagement) ?? 0, clicks: n(tot.clicks) ?? 0 },
      team: arr(c.team).map((t) => ({ name: String(t.name ?? ""), role: String(t.role ?? "") })),
      previews: arr(c.previews).map((p) => ({ deliverable: String(p.deliverable ?? ""), revision: n(p.revision) ?? 0, url: s(p.url), decidedAt: s(p.decided_at), previewOn: s(p.preview_on) })),
      usageGuide: guide && s(guide.message_id) ? { messageId: String(guide.message_id), name: String(guide.name ?? "") } : null,
      shootDays: arr(c.shoot_days).map((d) => ({ startsAt: String(d.starts_at), location: String(d.location ?? "") })),
      feedback: toFeedback(c.feedback),
      brandId: s(c.brand_id),
      clientTalentId: s(c.client_talent_id),
    },
  };
}

// ------------------------------------------------------------------ agência: satisfação, normas/NDA, prévias
export type FeedbackIndicator = {
  days: number;
  answered: number;
  pending: number;
  avg: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  recent: { dealId: string; deal: string; party: "brand" | "talent"; moment: FeedbackMoment; score: number; comment: string; answeredAt: string }[];
};

export async function getFeedbackIndicator(agencyId: string, days = 180): Promise<{ available: boolean; data: FeedbackIndicator | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_feedback_indicator", { p_agency: agencyId, p_days: days });
  if (error) return { available: !isMissingSchema(error), data: null };
  const r = obj(data);
  if (!r) return { available: true, data: null };
  return {
    available: true,
    data: {
      days: n(r.days) ?? days,
      answered: n(r.answered) ?? 0,
      pending: n(r.pending) ?? 0,
      avg: n(r.avg),
      promoters: n(r.promoters) ?? 0,
      passives: n(r.passives) ?? 0,
      detractors: n(r.detractors) ?? 0,
      recent: arr(r.recent).map((x) => ({
        dealId: String(x.deal_id),
        deal: String(x.deal ?? ""),
        party: x.party === "talent" ? "talent" : "brand",
        moment: x.moment === "closing" ? "closing" : "production_day",
        score: n(x.score) ?? 0,
        comment: String(x.comment ?? ""),
        answeredAt: String(x.answered_at ?? ""),
      })),
    },
  };
}

export type ProjectSettings = { norms: string; ndaText: string; ndaVersion: number; custom: boolean; updatedAt: string | null };

export async function getProjectSettings(agencyId: string): Promise<{ available: boolean; data: ProjectSettings | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_project_settings_get", { p_agency: agencyId });
  if (error) return { available: !isMissingSchema(error), data: null };
  const r = obj(data);
  if (!r) return { available: true, data: null };
  return { available: true, data: { norms: String(r.norms ?? ""), ndaText: String(r.nda_text ?? ""), ndaVersion: n(r.nda_version) ?? 1, custom: r.custom === true, updatedAt: s(r.updated_at) } };
}

export type DealPreview = { deliverableId: string; previewOn: string | null; versionIds: string[] };

/** Prévias do negócio (versões marcadas e data combinada). Sem a migração: vazio. */
export async function getDealPreviews(dealId: string): Promise<DealPreview[]> {
  if (!isUuid(dealId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deal_previews", { p_deal: dealId });
  if (error) return [];
  return arr(data).map((x) => ({ deliverableId: String(x.deliverable_id), previewOn: s(x.preview_on), versionIds: Array.isArray(x.version_ids) ? x.version_ids.map(String) : [] }));
}
