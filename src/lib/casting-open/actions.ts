"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Casting aberto (0126): pedir acesso ao contato e aos valores de um Hero de outra agência; a dona decide.
// Perfil reivindicado: a agência dona aprova ou recusa o "É você?" do Hero.

type Result = { ok: true } | { ok: false; error: string };
export type OpenContact = { email: string | null; phone: string | null; socials: Array<{ network: string; handle: string; url: string | null; followers: number | null }>; fees: number[] };

export async function requestCastingAccessAction(input: { talentId: string; note?: string }): Promise<Result> {
  const ctx = await requireAgency("manager");
  const parsed = z.object({ talentId: z.uuid(), note: z.string().trim().max(500).optional() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("casting_access_request", { p_agency: ctx.agency.id, p_talent: parsed.data.talentId, p_note: parsed.data.note || null });
  if (error) return agencyFail(error);
  revalidatePath("/agencia/casting");
  return { ok: true };
}

export async function openContactAction(talentId: string): Promise<{ ok: true; contact: OpenContact } | { ok: false; error: string }> {
  const ctx = await requireAgency("staff");
  if (!z.uuid().safeParse(talentId).success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("casting_open_contact", { p_agency: ctx.agency.id, p_talent: talentId });
  if (error) return agencyFail(error);
  const d = (data ?? {}) as Partial<OpenContact>;
  return { ok: true, contact: { email: d.email ?? null, phone: d.phone ?? null, socials: Array.isArray(d.socials) ? d.socials : [], fees: Array.isArray(d.fees) ? d.fees : [] } };
}

export async function decideCastingAccessAction(input: { id: string; approve: boolean }): Promise<Result> {
  await requireUser("/agencia/casting");
  const parsed = z.object({ id: z.uuid(), approve: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("casting_access_decide", { p_request: parsed.data.id, p_approve: parsed.data.approve });
  if (error) return agencyFail(error);
  revalidatePath("/agencia/casting");
  return { ok: true };
}

export async function decideProfileClaimAction(input: { id: string; approve: boolean }): Promise<Result> {
  await requireUser("/agencia/casting");
  const parsed = z.object({ id: z.uuid(), approve: z.boolean() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("profile_claim_decide", { p_claim: parsed.data.id, p_approve: parsed.data.approve });
  if (error) return agencyFail(error);
  revalidatePath("/agencia/casting");
  return { ok: true };
}

/** O Hero pede o perfil do casting que é dele ("É você?"). */
export async function claimProfileAction(talentId: string): Promise<Result> {
  await requireUser("/primeiro-acesso");
  if (!z.uuid().safeParse(talentId).success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("hero_claim_request", { p_talent: talentId });
  if (error) return agencyFail(error);
  revalidatePath("/primeiro-acesso");
  return { ok: true };
}

export type ClaimCandidate = { id: string; name: string; city: string | null; state: string | null; category: string | null; agency: string; email_matches: boolean; photo: string | null };

/** "É você?": perfis do casting com nome parecido (busca do próprio Hero no cadastro). */
export async function searchClaimCandidatesAction(name: string): Promise<ClaimCandidate[]> {
  await requireUser("/primeiro-acesso");
  const q = z.string().trim().min(4).max(80).safeParse(name);
  if (!q.success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("hero_claim_candidates", { p_name: q.data });
  return Array.isArray(data) ? (data as ClaimCandidate[]) : [];
}
