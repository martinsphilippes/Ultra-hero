import "server-only";
import { isActionInterest, isIdeaStatus, parseFormats } from "@/lib/creator-guide/format";
import { createClient } from "@/lib/supabase/server";
import {
  type MeetingAction,
  type YesNo,
  isMeetingMode,
  isMeetingStatus,
  parseChecks,
  parseNotes,
} from "./format";
import type { MeetingDoc, MeetingSummary, OpenMeetingAction } from "./types";

export type { MeetingDoc, MeetingSummary, OpenMeetingAction } from "./types";

// Ata de reunião (0138): leituras da equipe da agência (lista do Hero, a ata e os encaminhamentos pendentes).

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Row => x !== null) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const yesNo = (v: unknown): YesNo | null => (v === "yes" || v === "no" ? v : null);

function parseAction(r: Row): MeetingAction {
  return {
    id: strOrNull(r.id),
    title: str(r.title),
    ownerKind: r.owner_kind === "talent" ? "talent" : "team",
    ownerId: strOrNull(r.owner_id),
    owner: strOrNull(r.owner),
    dueOn: strOrNull(r.due_on),
    status: r.status === "done" ? "done" : "pending",
  };
}

/** Reuniões de um Hero (mais recente primeiro). null = sem acesso. */
export async function loadMeetings(talentId: string): Promise<MeetingSummary[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_meetings_list", { p_talent: talentId });
  if (error || !Array.isArray(data)) return null;
  return rows(data).map((r) => ({
    id: str(r.id),
    heldAt: str(r.held_at),
    mode: isMeetingMode(r.mode) ? r.mode : "online",
    status: isMeetingStatus(r.status) ? r.status : "draft",
    representative: strOrNull(r.representative),
    followUpOn: strOrNull(r.follow_up_on),
    summary: str(r.summary),
    checks: parseChecks(r.checks),
    formatsAnswered: num(r.formats_answered),
    hasQuestions: r.has_questions === true,
    actionsTotal: num(r.actions_total),
    actionsPending: num(r.actions_pending),
    actionsReady: num(r.actions_ready),
    finalizedAt: strOrNull(r.finalized_at),
  }));
}

/** A ata completa. null = não existe ou sem acesso. */
export async function loadMeeting(id: string): Promise<MeetingDoc | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_meeting_get", { p_id: id });
  const d = obj(data);
  if (error || !d) return null;
  const idea = obj(d.idea);
  return {
    id: str(d.id),
    talentId: str(d.talent_id),
    talentName: str(d.talent_name),
    contactEmail: strOrNull(d.contact_email),
    contactPhone: strOrNull(d.contact_phone),
    heldAt: str(d.held_at),
    mode: isMeetingMode(d.mode) ? d.mode : "online",
    representativeId: strOrNull(d.representative_id),
    representative: strOrNull(d.representative),
    participants: str(d.participants),
    fullName: str(d.full_name),
    contactConfirmed: yesNo(d.contact_confirmed),
    contactFix: str(d.contact_fix),
    notes: parseNotes(d.notes),
    formats: parseFormats(d.formats),
    actionKey: strOrNull(d.action_key),
    actionInterest: isActionInterest(d.action_interest) ? d.action_interest : null,
    registerIdea: d.register_idea === true,
    idea: idea && isIdeaStatus(idea.status) ? { id: str(idea.id), title: str(idea.title), status: idea.status } : null,
    checks: parseChecks(d.checks),
    senderId: strOrNull(d.sender_id),
    sender: strOrNull(d.sender),
    sentOn: strOrNull(d.sent_on),
    followUpOn: strOrNull(d.follow_up_on),
    status: isMeetingStatus(d.status) ? d.status : "draft",
    finalizedAt: strOrNull(d.finalized_at),
    finalizedBy: strOrNull(d.finalized_by),
    calendarEventId: strOrNull(d.calendar_event_id),
    createdAt: str(d.created_at),
    updatedAt: str(d.updated_at),
    actions: rows(d.actions).map(parseAction),
    availableActions: rows(d.available_actions).map((a) => ({ key: str(a.key), title: str(a.title), endsOn: str(a.ends_on) })),
    canManage: d.can_manage === true,
    canDelete: d.can_delete === true,
  };
}

/** Encaminhamentos pendentes das atas concluídas da agência (prazo mais próximo primeiro). */
export async function loadOpenMeetingActions(agencyId: string, mine: boolean): Promise<OpenMeetingAction[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_meeting_actions_open", { p_agency: agencyId, p_mine: mine });
  if (error || !Array.isArray(data)) return null;
  return rows(data).map((r) => ({
    id: str(r.id),
    title: str(r.title),
    ownerKind: r.owner_kind === "talent" ? "talent" : "team",
    ownerId: strOrNull(r.owner_id),
    owner: strOrNull(r.owner),
    dueOn: strOrNull(r.due_on),
    meetingId: str(r.meeting_id),
    heldAt: str(r.held_at),
    talentId: str(r.talent_id),
    talentName: str(r.talent_name),
    photoUrl: strOrNull(r.photo_url),
  }));
}
