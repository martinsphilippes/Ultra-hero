"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ACTION_INTERESTS, ACTION_LIMITS, FORMAT_INTERESTS, FORMAT_KEYS, IDEA_LIMITS, IDEA_STATUSES, NOTE_MAX } from "./format";

// Como trabalhamos (0136): o creator marca formatos, universos e ações e envia o projeto autoral; a equipe registra o
// formato na reunião e dá andamento ao projeto. O banco confere quem pode (my_talent_id / agency_can).

type Result = { ok: true } | { ok: false; error: string };
const GUIDE = "/heroi/como-trabalhamos";
const UNIVERSES = "/heroi/universos";

const formatSchema = z.object({ key: z.enum(FORMAT_KEYS), interest: z.enum(FORMAT_INTERESTS), note: z.string().trim().max(NOTE_MAX) });

/** Um formato por vez (os outros ficam como estavam). */
export async function saveFormatAction(input: z.input<typeof formatSchema>): Promise<Result> {
  await requireUser(GUIDE);
  const parsed = formatSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const { key, interest, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_formats_save", { p_formats: { [key]: { interest, note } } });
  if (error) return agencyFail(error);
  revalidatePath(GUIDE);
  return { ok: true };
}

const universesSchema = z.object({
  universes: z.array(z.string().max(40)).max(16),
  known: z.array(z.uuid()).max(80),
  explore: z.array(z.uuid()).max(80),
});

export async function saveUniversesAction(input: z.input<typeof universesSchema>): Promise<Result> {
  await requireUser(UNIVERSES);
  const parsed = universesSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_universes_save", {
    p_universes: parsed.data.universes,
    p_known: parsed.data.known,
    p_explore: parsed.data.explore,
  });
  if (error) return agencyFail(error);
  revalidatePath(UNIVERSES);
  revalidatePath(GUIDE);
  return { ok: true };
}

const respondSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/),
  interest: z.enum(ACTION_INTERESTS),
  categories: z.string().trim().max(ACTION_LIMITS.categories),
  availability: z.string().trim().max(ACTION_LIMITS.availability),
  notes: z.string().trim().max(ACTION_LIMITS.notes),
});

export async function respondActionAction(input: z.input<typeof respondSchema>): Promise<Result> {
  await requireUser(GUIDE);
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const { key, ...data } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_action_respond", { p_action: key, p_data: data });
  if (error) return agencyFail(error);
  revalidatePath(GUIDE);
  return { ok: true };
}

const ideaSchema = z.object({
  title: z.string().trim().min(3).max(IDEA_LIMITS.title),
  concept: z.string().trim().min(10).max(IDEA_LIMITS.concept),
  audience: z.string().trim().max(IDEA_LIMITS.audience),
  format: z.string().trim().max(IDEA_LIMITS.format),
  location: z.string().trim().max(IDEA_LIMITS.location),
  timeline: z.string().trim().max(IDEA_LIMITS.timeline),
  stage: z.string().trim().max(IDEA_LIMITS.stage),
  partners: z.string().trim().max(IDEA_LIMITS.partners),
  needs: z.string().trim().max(IDEA_LIMITS.needs),
});

export async function submitIdeaAction(input: z.input<typeof ideaSchema>): Promise<Result> {
  await requireUser(GUIDE);
  const parsed = ideaSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_idea_submit", { p_data: parsed.data });
  if (error) return agencyFail(error);
  revalidatePath(GUIDE);
  return { ok: true };
}

// ------------------------------------------------------------------ equipe da agência

const teamFormatSchema = formatSchema.extend({ talentId: z.uuid() });

/** A equipe registra o interesse do creator num formato durante a reunião. */
export async function saveFormatTeamAction(input: z.input<typeof teamFormatSchema>): Promise<Result> {
  const parsed = teamFormatSchema.safeParse(input);
  await requireUser(parsed.success ? `/agencia/casting/${parsed.data.talentId}/relacionamento` : "/agencia/casting");
  if (!parsed.success) return agencyFail("invalid_input");
  const { talentId, key, interest, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("talent_formats_save_team", { p_talent: talentId, p_formats: { [key]: { interest, note } } });
  if (error) return agencyFail(error);
  revalidatePath(`/agencia/casting/${talentId}/relacionamento`);
  return { ok: true };
}

const ideaStatusSchema = z.object({ id: z.uuid(), talentId: z.uuid(), status: z.enum(IDEA_STATUSES), note: z.string().trim().max(1000) });

/** Gestor+ dá andamento ao projeto autoral (o creator recebe o aviso quando a etapa muda). */
export async function updateIdeaAction(input: z.input<typeof ideaStatusSchema>): Promise<Result> {
  const parsed = ideaStatusSchema.safeParse(input);
  await requireUser(parsed.success ? `/agencia/casting/${parsed.data.talentId}/relacionamento` : "/agencia/casting");
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("creator_idea_update", { p_id: parsed.data.id, p_status: parsed.data.status, p_note: parsed.data.note });
  if (error) return agencyFail(error);
  revalidatePath(`/agencia/casting/${parsed.data.talentId}/relacionamento`);
  return { ok: true };
}
