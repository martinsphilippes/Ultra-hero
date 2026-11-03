"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { BR_UFS, PROFESSIONAL_SPECIALTIES, cnpjDigits, isValidCnpj } from "@/lib/invitations/rules";
import { createClient } from "@/lib/supabase/server";

// Primeiro acesso (0091): quem aceitou convite de agência, marca, fornecedor ou profissional sem empresa cria a
// empresa/perfil aqui. A RPC confere o passo em aberto da própria pessoa e dá o papel certo (Adm, Dono, owner).

export type OnboardingResult = { ok: true; home: string } | { ok: false; error: string };

const name = (max: number) => z.string().trim().min(2).max(max);
const optionalCnpj = z
  .string()
  .trim()
  .max(20)
  .optional()
  .refine((v) => !v || isValidCnpj(v), { message: "invalid_cnpj" });

function done(home: string): OnboardingResult {
  revalidatePath("/", "layout");
  return { ok: true, home };
}

export async function createAgencyAction(input: { name: string; cnpj?: string; contactEmail?: string }): Promise<OnboardingResult> {
  await requireUser("/primeiro-acesso");
  const parsed = z.object({ name: name(80), cnpj: optionalCnpj, contactEmail: z.union([z.literal(""), z.email().max(254)]).optional() }).safeParse(input);
  if (!parsed.success) return agencyFail(parsed.error.issues.some((i) => i.message === "invalid_cnpj") ? "invalid_cnpj" : "invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("onboarding_create_agency", {
      p_name: parsed.data.name,
      p_cnpj: parsed.data.cnpj ? cnpjDigits(parsed.data.cnpj) : null,
      p_contact_email: parsed.data.contactEmail ? parsed.data.contactEmail.toLowerCase() : null,
    });
    if (error) return agencyFail(error);
    return done("/agencia");
  } catch (error) {
    return agencyFail(error);
  }
}

export async function createBrandAction(input: { name: string; cnpj?: string; segment?: string; siteUrl: string }): Promise<OnboardingResult> {
  await requireUser("/primeiro-acesso");
  const parsed = z
    .object({ name: name(60), cnpj: optionalCnpj, segment: z.string().trim().max(60).optional(), siteUrl: z.string().trim().max(500) })
    .safeParse(input);
  if (!parsed.success) return agencyFail(parsed.error.issues.some((i) => i.message === "invalid_cnpj") ? "invalid_cnpj" : "invalid_input");
  // site sem protocolo vira https://
  const site = /^https?:\/\//i.test(parsed.data.siteUrl) ? parsed.data.siteUrl.replace(/^http:\/\//i, "https://") : `https://${parsed.data.siteUrl}`;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("onboarding_create_brand", {
      p_name: parsed.data.name,
      p_cnpj: parsed.data.cnpj ? cnpjDigits(parsed.data.cnpj) : null,
      p_segment: parsed.data.segment || null,
      p_site_url: site,
    });
    if (error) return agencyFail(error);
    return done("/marca");
  } catch (error) {
    return agencyFail(error);
  }
}

export async function createSellerAction(input: { name: string }): Promise<OnboardingResult> {
  await requireUser("/primeiro-acesso");
  const parsed = z.object({ name: name(80) }).safeParse(input);
  if (!parsed.success) return agencyFail("name_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("onboarding_create_seller", { p_name: parsed.data.name });
    if (error) return agencyFail(error);
    return done("/seller");
  } catch (error) {
    return agencyFail(error);
  }
}

export async function createProfessionalAction(input: { name: string; specialty: string; registryNumber: string; registryUf: string }): Promise<OnboardingResult> {
  await requireUser("/primeiro-acesso");
  const parsed = z
    .object({
      name: name(80),
      specialty: z.enum(PROFESSIONAL_SPECIALTIES),
      registryNumber: z.string().trim().regex(/^[0-9A-Za-z./-]{2,20}$/),
      registryUf: z.enum(BR_UFS),
    })
    .safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("onboarding_create_professional", {
      p_name: parsed.data.name,
      p_specialty: parsed.data.specialty,
      p_registry_number: parsed.data.registryNumber,
      p_registry_uf: parsed.data.registryUf,
    });
    if (error) return agencyFail(error);
    return done("/profissional");
  } catch (error) {
    return agencyFail(error);
  }
}
