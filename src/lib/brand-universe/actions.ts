"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGO_BUCKET, BRAND_LOGO_MAX_BYTES, sniffLogo } from "./logo";

// Universo de marcas (0129/0131): a Groscove edita a marca e os dados internos, decide os pedidos de login das
// marcas e troca o logo; quem se cadastra como Marca pede o acesso à marca que já existe ("Você é da X?").

type Result = { ok: true } | { ok: false; error: string };

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
const opt = (max: number) => z.string().trim().max(max).optional();

const saveSchema = z.object({
  brandId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().max(40),
  siteUrl: z.string().trim().max(300),
  emailDomains: z.array(domain).max(10),
  internal: z
    .object({ cpa: opt(80), cpaInfluencer: opt(80), mid: opt(40), officialPhone: opt(120), officialEmail: opt(254) })
    .optional(),
});

/** A Groscove (gestor+) salva a ficha da marca; os dados internos só vão quando a tela os mostra. */
export async function saveBrandAdminAction(input: z.input<typeof saveSchema>): Promise<Result> {
  await requireUser("/agencia/marcas");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const payload: Record<string, unknown> = { name: d.name, category: d.category, site_url: d.siteUrl, email_domains: d.emailDomains };
  if (d.internal) {
    payload.cpa = d.internal.cpa ?? "";
    payload.cpa_influencer = d.internal.cpaInfluencer ?? "";
    payload.mid = d.internal.mid ?? "";
    payload.official_phone = d.internal.officialPhone ?? "";
    payload.official_email = d.internal.officialEmail ?? "";
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("brand_admin_save", { p_brand: d.brandId, p_data: payload as never });
  if (error) return agencyFail(error);
  revalidatePath("/agencia/marcas");
  revalidatePath(`/agencia/marcas/${d.brandId}`);
  return { ok: true };
}

/** A Groscove aprova (o primeiro vira Dono, os seguintes Equipe) ou recusa o pedido de login da marca. */
export async function decideBrandLoginAction(input: { id: string; approve: boolean; role?: "owner" | "staff" }): Promise<Result> {
  await requireUser("/agencia/marcas");
  const parsed = z.object({ id: z.uuid(), approve: z.boolean(), role: z.enum(["owner", "staff"]).optional() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("brand_login_decide", {
    p_request: parsed.data.id,
    p_approve: parsed.data.approve,
    ...(parsed.data.role ? { p_role: parsed.data.role } : {}),
  });
  if (error) return agencyFail(error);
  revalidatePath("/agencia/marcas");
  return { ok: true };
}

export type BrandCandidate = { id: string; name: string; logo_url: string | null; site_url: string | null; category: string | null; domain_matches: boolean };

/** "Você é da X?": marcas do domínio do e-mail da pessoa ou pelo nome digitado. */
export async function searchBrandCandidatesAction(name: string): Promise<BrandCandidate[]> {
  await requireUser("/primeiro-acesso");
  const q = z.string().trim().max(60).safeParse(name);
  if (!q.success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("brand_login_candidates", { p_name: q.data });
  return Array.isArray(data) ? (data as BrandCandidate[]) : [];
}

/** Quem se cadastrou como Marca pede o acesso à marca que já existe; a Groscove aprova. */
export async function requestBrandLoginAction(input: { brandId: string; fullName: string; jobTitle?: string }): Promise<Result> {
  await requireUser("/primeiro-acesso");
  const parsed = z
    .object({ brandId: z.uuid(), fullName: z.string().trim().min(2).max(80), jobTitle: z.string().trim().max(80).optional() })
    .safeParse(input);
  if (!parsed.success) return agencyFail(parsed.error.issues.some((i) => i.path[0] === "fullName") ? "name_required" : "invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("brand_login_request", {
    p_brand: parsed.data.brandId,
    p_full_name: parsed.data.fullName,
    p_job_title: parsed.data.jobTitle ?? "",
  });
  if (error) return agencyFail(error);
  revalidatePath("/primeiro-acesso");
  return { ok: true };
}

/** Troca o logo (Groscove gestor+ ou a própria marca). PNG, JPEG ou WebP de até 1 MB; o tipo vem dos bytes. */
export async function uploadBrandLogoAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireUser("/agencia/marcas");
  const brandId = z.uuid().safeParse(formData.get("brandId"));
  const file = formData.get("file");
  if (!brandId.success || !(file instanceof Blob) || file.size === 0) return agencyFail("invalid_image");
  if (file.size > BRAND_LOGO_MAX_BYTES) return agencyFail("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffLogo(bytes);
  if (!kind) return agencyFail("invalid_image");
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return agencyFail("generic");

  const supabase = await createClient();
  const { data: can } = await supabase.rpc("brand_logo_can_edit", { p_brand: brandId.data });
  if (can !== true) return agencyFail("forbidden");

  const path = `${brandId.data}/${crypto.randomUUID()}.${kind.ext}`;
  const admin = createAdminClient();
  const { error: upError } = await admin.storage.from(BRAND_LOGO_BUCKET).upload(path, bytes, { upsert: false, contentType: kind.mime });
  if (upError) return agencyFail("generic");
  const url = `${base}/storage/v1/object/public/${BRAND_LOGO_BUCKET}/${path}`;
  const { error } = await supabase.rpc("brand_logo_set", { p_brand: brandId.data, p_url: url });
  if (error) {
    await admin.storage.from(BRAND_LOGO_BUCKET).remove([path]);
    return agencyFail(error);
  }
  revalidatePath("/agencia/marcas");
  revalidatePath(`/agencia/marcas/${brandId.data}`);
  revalidatePath("/marca/equipe");
  return { ok: true, url };
}
