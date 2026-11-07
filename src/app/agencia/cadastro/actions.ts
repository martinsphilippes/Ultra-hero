"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { cnpjDigits, isValidCnpj } from "@/lib/invitations/rules";
import { PARTNER_TERMS_VERSION } from "@/lib/partner-terms/version";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_LEVELS } from "@/lib/team/levels";

// Cadastro PJ do colaborador (0125): o mesmo formulário serve para pedir acesso (quem tem e-mail do domínio da agência)
// e para quem já é da agência completar/editar os dados. O banco confere tudo de novo (CNPJ, nível, termo).

export type MemberProfileInput = { fullName: string; cnpj: string; jobTitle: string; level: string; acceptTerms: boolean };
export type MemberProfileResult = { ok: true } | { ok: false; error: string; field?: "fullName" | "cnpj" | "jobTitle" | "level" | "terms" };

const schema = z.object({
  fullName: z.string().trim().min(2).max(80),
  cnpj: z.string().trim().max(20),
  jobTitle: z.string().trim().min(2).max(80),
  level: z.enum(MEMBER_LEVELS),
  acceptTerms: z.literal(true),
});

function check(input: MemberProfileInput): MemberProfileResult | null {
  const parsed = schema.safeParse(input);
  if (parsed.success && isValidCnpj(input.cnpj)) return null;
  const field = !parsed.success ? (parsed.error.issues[0]?.path[0] as string | undefined) : "cnpj";
  const map: Record<string, NonNullable<Extract<MemberProfileResult, { ok: false }>["field"]>> = {
    fullName: "fullName",
    cnpj: "cnpj",
    jobTitle: "jobTitle",
    level: "level",
    acceptTerms: "terms",
  };
  return { ok: false, error: "invalid_input", field: map[field ?? ""] ?? (isValidCnpj(input.cnpj) ? undefined : "cnpj") };
}

/** Pedido de acesso à agência do domínio do e-mail (primeiro acesso). */
export async function requestAgencyAccessAction(input: MemberProfileInput): Promise<MemberProfileResult> {
  await requireUser("/primeiro-acesso");
  const invalid = check(input);
  if (invalid) return invalid;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_access_request", {
      p_full_name: input.fullName.trim(),
      p_cnpj: cnpjDigits(input.cnpj),
      p_job_title: input.jobTitle.trim(),
      p_level: input.level,
      p_terms_version: PARTNER_TERMS_VERSION,
    });
    if (error) return agencyFail(error);
    revalidatePath("/primeiro-acesso");
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Quem já é da agência completa (ou edita) o próprio cadastro. */
export async function completeMemberProfileAction(input: MemberProfileInput): Promise<MemberProfileResult> {
  await requireUser("/agencia");
  const invalid = check(input);
  if (invalid) return invalid;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("member_complete_profile", {
      p_full_name: input.fullName.trim(),
      p_cnpj: cnpjDigits(input.cnpj),
      p_job_title: input.jobTitle.trim(),
      p_level: input.level,
      p_terms_version: PARTNER_TERMS_VERSION,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Adm aceita (com o nível de acesso) ou recusa um pedido. */
export async function decideAccessAction(input: { id: string; approve: boolean; role: string; note?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser("/agencia/equipe");
  const parsed = z
    .object({ id: z.uuid(), approve: z.boolean(), role: z.enum(["admin", "manager", "staff"]), note: z.string().trim().max(300).optional() })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_access_decide", {
      p_request: parsed.data.id,
      p_approve: parsed.data.approve,
      p_role: parsed.data.role,
      p_note: parsed.data.note || null,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia", "layout");
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}
