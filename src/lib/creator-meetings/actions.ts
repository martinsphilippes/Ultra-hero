"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { ACTION_INTERESTS, FORMAT_INTERESTS, FORMAT_KEYS, NOTE_MAX } from "@/lib/creator-guide/format";
import { toZonedIso } from "@/lib/deals/schemas";
import { createClient } from "@/lib/supabase/server";
import {
  ACTION_STATUSES,
  ACTION_TITLE_MAX,
  INTERNAL_DATA,
  K_KEYS,
  LIMITS,
  MAX_ACTIONS,
  MEETING_MODES,
  MEETING_TZ,
  NOTE_LIMITS,
  type NoteKey,
  OWNER_KINDS,
  REGISTRATION_KEYS,
  YES_NO,
} from "./format";

// Ata de reunião (0138): a equipe da agência cria, salva, conclui, reabre (gestor+) e apaga o rascunho; marca os
// encaminhamentos. O banco confere quem pode (agency_can) e as regras da ata (meeting_incomplete, sensitive_data).

type Result = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();

const actionSchema = z.object({
  id: uuid.nullable(),
  title: z.string().trim().min(2).max(ACTION_TITLE_MAX),
  ownerKind: z.enum(OWNER_KINDS),
  ownerId: uuid.nullable(),
  dueOn: day.nullable(),
  status: z.enum(ACTION_STATUSES),
});

const checksSchema = z.strictObject({
  ...Object.fromEntries([...REGISTRATION_KEYS, ...K_KEYS].map((k) => [k, z.literal(true).optional()])),
  media_kit: z.enum(YES_NO).optional(),
  channels_insights: z.enum(YES_NO).optional(),
  internal_data: z.enum(INTERNAL_DATA).optional(),
});

const meetingSchema = z.object({
  heldDate: day,
  heldTime: z.string().regex(/^\d{2}:\d{2}$/),
  mode: z.enum(MEETING_MODES),
  representativeId: uuid.nullable(),
  participants: z.string().trim().max(LIMITS.participants),
  fullName: z.string().trim().max(LIMITS.fullName),
  contactConfirmed: z.enum(YES_NO).nullable(),
  contactFix: z.string().trim().max(LIMITS.contactFix),
  notes: z.record(z.string(), z.string()).superRefine((notes, ctx) => {
    for (const [k, v] of Object.entries(notes)) {
      const max = (NOTE_LIMITS as Record<string, number>)[k];
      if (max === undefined || v.trim().length > max) ctx.addIssue({ code: "custom", message: "invalid_input", path: [k] });
    }
  }),
  formats: z.partialRecord(z.enum(FORMAT_KEYS), z.object({ interest: z.enum(FORMAT_INTERESTS), note: z.string().trim().max(NOTE_MAX) })),
  actionKey: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/).nullable(),
  actionInterest: z.enum(ACTION_INTERESTS).nullable(),
  registerIdea: z.boolean(),
  checks: checksSchema,
  senderId: uuid.nullable(),
  sentOn: day.nullable(),
  followUpOn: day.nullable(),
  actions: z.array(actionSchema).max(MAX_ACTIONS),
});
export type MeetingInput = z.input<typeof meetingSchema>;

const saveSchema = z.object({ id: uuid, talentId: uuid, data: meetingSchema });

function toRpc(d: z.output<typeof meetingSchema>) {
  const notes: Partial<Record<NoteKey, string>> = {};
  for (const [k, v] of Object.entries(d.notes)) if (v.trim()) notes[k as NoteKey] = v.trim();
  return {
    held_at: toZonedIso(d.heldDate, d.heldTime, MEETING_TZ),
    mode: d.mode,
    representative_id: d.representativeId,
    participants: d.participants,
    full_name: d.fullName,
    contact_confirmed: d.contactConfirmed,
    contact_fix: d.contactFix,
    notes,
    formats: d.formats,
    action_key: d.actionKey,
    action_interest: d.actionInterest,
    register_idea: d.registerIdea,
    checks: d.checks,
    sender_id: d.senderId,
    sent_on: d.sentOn,
    follow_up_on: d.followUpOn,
    actions: d.actions.map((a) => ({ id: a.id, title: a.title, owner_kind: a.ownerKind, owner_id: a.ownerKind === "team" ? a.ownerId : null, due_on: a.dueOn, status: a.status })),
  };
}

function revalidateMeeting(talentId: string, id?: string) {
  revalidatePath(`/agencia/casting/${talentId}/reunioes`);
  if (id) revalidatePath(`/agencia/casting/${talentId}/reunioes/${id}`);
  revalidatePath("/agencia/casting/encaminhamentos");
}

/** Nova ata em rascunho, já com o que se sabe do Hero (formatos, ação aberta). */
export async function createMeetingAction(talentId: string): Promise<CreateResult> {
  const parsed = uuid.safeParse(talentId);
  await requireUser(parsed.success ? `/agencia/casting/${parsed.data}/reunioes` : "/agencia/casting");
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_meeting_create", { p_talent: parsed.data });
  if (error || typeof data !== "string") return agencyFail(error ?? "generic");
  revalidateMeeting(parsed.data);
  return { ok: true, id: data };
}

async function save(input: z.input<typeof saveSchema>): Promise<{ ok: true; data: z.output<typeof saveSchema> } | { ok: false; error: string }> {
  const parsed = saveSchema.safeParse(input);
  await requireUser(parsed.success ? `/agencia/casting/${parsed.data.talentId}/reunioes/${parsed.data.id}` : "/agencia/casting");
  if (!parsed.success) return agencyFail("invalid_input");
  const payload = toRpc(parsed.data.data);
  if (!payload.held_at) return agencyFail("invalid_date");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_meeting_save", { p_id: parsed.data.id, p_data: payload });
  if (error) return agencyFail(error);
  return { ok: true, data: parsed.data };
}

/** Salva a ata (rascunho: tudo; concluída: checklist, follow-up e encaminhamentos). */
export async function saveMeetingAction(input: z.input<typeof saveSchema>): Promise<Result> {
  const res = await save(input);
  if (!res.ok) return res;
  revalidateMeeting(res.data.talentId, res.data.id);
  return { ok: true };
}

/** Salva e conclui: formatos, ação aberta, projeto autoral, follow-up na agenda e avisos aos responsáveis. */
export async function finalizeMeetingAction(input: z.input<typeof saveSchema>): Promise<Result> {
  const res = await save(input);
  if (!res.ok) return res;
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_meeting_finalize", { p_id: res.data.id });
  revalidateMeeting(res.data.talentId, res.data.id);
  if (error) return agencyFail(error);
  revalidatePath(`/agencia/casting/${res.data.talentId}/relacionamento`);
  revalidatePath(`/agencia/casting/${res.data.talentId}`);
  if (res.data.data.actionKey) revalidatePath(`/agencia/casting/acoes/${res.data.data.actionKey}`);
  return { ok: true };
}

const refSchema = z.object({ id: uuid, talentId: uuid });

/** Gestor+ reabre a ata concluída para corrigir. */
export async function reopenMeetingAction(input: z.input<typeof refSchema>): Promise<Result> {
  const parsed = refSchema.safeParse(input);
  await requireUser(parsed.success ? `/agencia/casting/${parsed.data.talentId}/reunioes/${parsed.data.id}` : "/agencia/casting");
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_meeting_reopen", { p_id: parsed.data.id });
  if (error) return agencyFail(error);
  revalidateMeeting(parsed.data.talentId, parsed.data.id);
  return { ok: true };
}

/** Apaga um rascunho que nunca foi concluído (quem criou ou gestor+). */
export async function deleteMeetingAction(input: z.input<typeof refSchema>): Promise<Result> {
  const parsed = refSchema.safeParse(input);
  await requireUser(parsed.success ? `/agencia/casting/${parsed.data.talentId}/reunioes` : "/agencia/casting");
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_meeting_delete", { p_id: parsed.data.id });
  if (error) return agencyFail(error);
  revalidateMeeting(parsed.data.talentId);
  return { ok: true };
}

const actionStatusSchema = z.object({ actionId: uuid, talentId: uuid, meetingId: uuid, status: z.enum(ACTION_STATUSES) });

/** Marca um encaminhamento como feito (ou volta para pendente). */
export async function setMeetingActionStatusAction(input: z.input<typeof actionStatusSchema>): Promise<Result> {
  const parsed = actionStatusSchema.safeParse(input);
  await requireUser("/agencia/casting/encaminhamentos");
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_meeting_action_set", { p_action: parsed.data.actionId, p_status: parsed.data.status });
  if (error) return agencyFail(error);
  revalidateMeeting(parsed.data.talentId, parsed.data.meetingId);
  return { ok: true };
}
