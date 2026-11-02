import { BRAND_STATUSES, type BrandStatus } from "@/lib/deals/stages";
import { DELIVERABLE_STATUSES, type DeliverableStatus } from "@/lib/deals/vocab";
import type { BrandWorkboard, TalentTodayData } from "./logic";

// Normalização das leituras fechadas da 0078 (brand_workboard / talent_today): pura, testada com vitest.

type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const brandStatus = (v: unknown): BrandStatus => ((BRAND_STATUSES as readonly string[]).includes(String(v)) ? (v as BrandStatus) : "draft");
const delivStatus = (v: unknown): DeliverableStatus => ((DELIVERABLE_STATUSES as readonly string[]).includes(String(v)) ? (v as DeliverableStatus) : "planned");
const tz = (v: unknown) => (typeof v === "string" && v ? v : "America/Sao_Paulo");

export function toBrandWorkboard(data: unknown): BrandWorkboard | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const k = data as Row;
  const role = k.role === "owner" || k.role === "staff" ? k.role : null;
  return {
    role,
    timezone: tz(k.timezone),
    campaigns: arr(k.campaigns).map((c) => ({
      requestId: text(c.request_id),
      title: text(c.title),
      requestStatus: text(c.request_status),
      brandStatus: brandStatus(c.brand_status),
      dealTitle: str(c.deal_title),
      submittedAt: str(c.submitted_at),
      updatedAt: text(c.updated_at),
      requestedTalentName: str(c.requested_talent_name),
      requestedCount: num(c.requested_count),
    })),
    talents: arr(k.talents).map((t) => ({ dealTalentId: text(t.deal_talent_id), requestId: text(t.request_id), talentName: text(t.talent_name), status: text(t.status) })),
    deliverables: arr(k.deliverables).map((d) => ({
      id: text(d.id),
      dealTalentId: text(d.deal_talent_id),
      requestId: text(d.request_id),
      kind: text(d.kind),
      network: str(d.network),
      title: text(d.title),
      status: delivStatus(d.status),
      dueAt: str(d.due_at),
      publishAt: str(d.publish_at),
      submittedAt: str(d.submitted_at),
      talentName: text(d.talent_name),
    })),
    scriptApprovals: arr(k.script_approvals).map((s) => ({ taskId: text(s.task_id), requestId: text(s.request_id), dealTitle: text(s.deal_title), talentName: str(s.talent_name), dueAt: str(s.due_at), since: str(s.since) })),
    termsPending: arr(k.terms_pending).map((m) => ({ termsId: text(m.terms_id), requestId: text(m.request_id), dealTitle: text(m.deal_title), version: num(m.version), sentAt: str(m.sent_at), validUntil: str(m.valid_until) })),
    threads: arr(k.threads).map((m) => ({ dealId: text(m.deal_id), requestId: text(m.request_id), dealTitle: text(m.deal_title), lastAt: text(m.last_at), authorLabel: text(m.author_label), excerpt: text(m.excerpt) })),
  };
}

export function toTalentToday(data: unknown): TalentTodayData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const k = data as Row;
  return {
    timezone: tz(k.timezone),
    tasks: arr(k.tasks).map((t) => ({
      id: text(t.id),
      step: t.step === null || t.step === undefined ? null : num(t.step),
      title: text(t.title),
      status: text(t.status),
      dueAt: str(t.due_at),
      feedback: text(t.feedback),
      dealId: str(t.deal_id),
      dealTitle: str(t.deal_title),
      brandName: str(t.brand_name),
      dealTalentId: str(t.deal_talent_id),
    })),
    offers: arr(k.offers).map((o) => ({ dealTalentId: text(o.deal_talent_id), status: text(o.status), respondBy: str(o.respond_by), consultedAt: str(o.consulted_at), dealTitle: text(o.deal_title), brandName: text(o.brand_name) })),
    deliverables: arr(k.deliverables).map((d) => ({
      id: text(d.id),
      dealTalentId: text(d.deal_talent_id),
      dealId: text(d.deal_id),
      kind: text(d.kind),
      network: str(d.network),
      title: text(d.title),
      status: delivStatus(d.status),
      dueAt: str(d.due_at),
      publishAt: str(d.publish_at),
      brandFeedback: text(d.brand_feedback),
      decidedAt: str(d.decided_at),
      dealTitle: text(d.deal_title),
      brandName: text(d.brand_name),
    })),
    terms: arr(k.terms).map((m) => ({ termsId: text(m.terms_id), dealTalentId: text(m.deal_talent_id), version: num(m.version), sentAt: str(m.sent_at), validUntil: str(m.valid_until), dealTitle: text(m.deal_title), brandName: text(m.brand_name) })),
  };
}
