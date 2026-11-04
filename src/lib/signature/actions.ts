"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { requireBrand } from "@/lib/brand-portal/server";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "@/lib/talent/errors";
import { cleanSignerName, clientIpFrom, taxIdKind } from "./tax-id";

// Assinatura eletrônica simples dos termos (0084). A tela mostra o texto exato e o hash (prévia); a assinatura
// manda nome, CPF/CNPJ e o hash visto. IP e navegador são lidos AQUI, dos cabeçalhos da requisição (nunca do
// cliente); o banco grava e-mail da conta, data/hora e recalcula o hash do texto.

export type SignPortal = "brand" | "office";
export type SignPreview = { termsId: string; version: number; text: string; sha256: string };
export type SignResult = { ok: true; message: string; id: string } | { ok: false; error: string };

const uuid = z.uuid();
const fail = (portal: SignPortal, error: unknown) => (portal === "office" ? talentFail(error) : agencyFail(error));

async function guard(portal: SignPortal): Promise<boolean> {
  if (portal === "brand") {
    const ctx = await requireBrand();
    return ctx.role === "owner";
  }
  await requireUser("/heroi/oportunidades");
  return true;
}

export async function termsSignPreviewAction(portal: SignPortal, input: { termsId: string }): Promise<{ ok: true; preview: SignPreview } | { ok: false; error: string }> {
  if (!(await guard(portal))) return fail(portal, "forbidden");
  const parsed = z.object({ termsId: uuid }).safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("terms_sign_preview", { p_terms: parsed.data.termsId });
    if (error) return fail(portal, error);
    const raw = (data ?? {}) as Record<string, unknown>;
    return { ok: true, preview: { termsId: String(raw.terms_id), version: Number(raw.version), text: String(raw.text ?? ""), sha256: String(raw.sha256 ?? "") } };
  } catch (error) {
    return fail(portal, error);
  }
}

const signSchema = z.object({
  termsId: uuid,
  fullName: z.string().max(200),
  taxId: z.string().max(40),
  expectedHash: z.string().regex(/^[0-9a-f]{64}$/),
  dealId: uuid,
  requestId: uuid.nullable().optional(),
  dealTalentId: uuid.nullable().optional(),
});

export async function signTermsAction(portal: SignPortal, input: z.input<typeof signSchema>): Promise<SignResult> {
  if (!(await guard(portal))) return fail(portal, "forbidden");
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  const name = cleanSignerName(d.fullName);
  if (!name) return fail(portal, "name_required");
  if (!taxIdKind(d.taxId)) return fail(portal, "invalid_tax_id");
  try {
    const h = await headers();
    const args = { p_terms: d.termsId, p_full_name: name, p_tax_id: d.taxId, p_expected_hash: d.expectedHash, p_ip: clientIpFrom(h), p_user_agent: (h.get("user-agent") ?? "").slice(0, 400) };
    const supabase = await createClient();
    const { data, error } = portal === "brand" ? await supabase.rpc("brand_terms_sign", args) : await supabase.rpc("talent_terms_sign", args);
    if (error || !data) return fail(portal, error ?? "generic");
    if (d.requestId) revalidatePath(`/marca/campanhas/${d.requestId}`);
    if (d.dealTalentId) revalidatePath(`/heroi/oportunidades/${d.dealTalentId}`);
    revalidatePath(`/agencia/negocios/${d.dealId}`, "layout");
    const t = await getTranslations("commercial.signature");
    return { ok: true, message: t("signed"), id: data };
  } catch (error) {
    return fail(portal, error);
  }
}
