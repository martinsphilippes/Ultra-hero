"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { BRAND_LOGO_MAX_BYTES, sniffLogo } from "@/lib/brand-universe/logo";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Editor da Onda Digital (0134): a Groscove (gestor+) atualiza seguidores, cases e ondas. O banco confere quem pode.

type Result = { ok: true } | { ok: false; error: string };
const EDITOR = "/agencia/onda-digital/conteudo";
const ONDA_ASSETS = "onda-assets";

function refresh() {
  revalidatePath(EDITOR);
  revalidatePath("/marca/onda-digital");
}

const profileSchema = z.object({
  id: z.uuid().optional(),
  network: z.enum(["instagram", "x"]).optional(),
  handle: z
    .string()
    .trim()
    .transform((h) => h.replace(/^@/, "").toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9._]{1,40}$/))
    .optional(),
  followers: z.number().int().min(0).max(10_000_000_000).optional(),
  active: z.boolean().optional(),
});

export async function saveOndaProfileAction(input: z.input<typeof profileSchema>): Promise<Result> {
  await requireUser(EDITOR);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const { id, ...rest } = parsed.data;
  const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_admin_profile_save", { p_id: (id ?? null) as string, p_data: data as never });
  if (error) return agencyFail(error);
  refresh();
  return { ok: true };
}

/** Foto de uma página (PNG, JPG ou WebP até 1 MB; o tipo vem dos bytes). */
export async function uploadOndaAvatarAction(formData: FormData): Promise<Result> {
  await requireUser(EDITOR);
  const id = z.uuid().safeParse(formData.get("id"));
  const file = formData.get("file");
  if (!id.success || !(file instanceof Blob) || file.size === 0) return agencyFail("invalid_image");
  if (file.size > BRAND_LOGO_MAX_BYTES) return agencyFail("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffLogo(bytes);
  if (!kind) return agencyFail("invalid_image");
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return agencyFail("generic");
  const supabase = await createClient();
  const { data: can } = await supabase.rpc("onda_admin_can");
  if (can !== true) return agencyFail("forbidden");
  const path = `perfis/${id.data}/${crypto.randomUUID()}.${kind.ext}`;
  const admin = createAdminClient();
  const { error: upError } = await admin.storage.from(ONDA_ASSETS).upload(path, bytes, { upsert: false, contentType: kind.mime });
  if (upError) return agencyFail("generic");
  const url = `${base}/storage/v1/object/public/${ONDA_ASSETS}/${path}`;
  const { error } = await supabase.rpc("onda_admin_profile_save", { p_id: id.data, p_data: { avatar_url: url } as never });
  if (error) {
    await admin.storage.from(ONDA_ASSETS).remove([path]);
    return agencyFail(error);
  }
  refresh();
  return { ok: true };
}

const metricSchema = z.object({ k: z.enum(["reach", "impressions", "impacts", "feed_reach"]), v: z.number().min(0).max(100_000_000_000), plus: z.boolean().optional() });
const caseSchema = z.object({
  id: z.uuid().optional(),
  brandName: z.string().trim().min(1).max(60),
  category: z.string().trim().max(40),
  description: z.string().trim().min(1).max(300),
  metrics: z.array(metricSchema).max(4),
  active: z.boolean(),
});

export async function saveOndaCaseAction(input: z.input<typeof caseSchema>): Promise<Result> {
  await requireUser(EDITOR);
  const parsed = caseSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_admin_case_save", {
    p_id: (d.id ?? null) as string,
    p_data: { brand_name: d.brandName, category: d.category, description: d.description, metrics: d.metrics, active: d.active } as never,
  });
  if (error) return agencyFail(error);
  refresh();
  return { ok: true };
}

export async function deleteOndaCaseAction(id: string): Promise<Result> {
  await requireUser(EDITOR);
  if (!z.uuid().safeParse(id).success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_admin_case_delete", { p_id: id });
  if (error) return agencyFail(error);
  refresh();
  return { ok: true };
}

const packageSchema = z.object({
  slug: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(60),
  scope: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(300),
  active: z.boolean(),
});

export async function saveOndaPackageAction(input: z.input<typeof packageSchema>): Promise<Result> {
  await requireUser(EDITOR);
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_admin_package_save", {
    p_slug: (d.slug || null) as string,
    p_data: { name: d.name, scope: d.scope, description: d.description, active: d.active } as never,
  });
  if (error) return agencyFail(error);
  refresh();
  return { ok: true };
}

/** Nova ordem dos cases ou das ondas (a lista inteira, de cima para baixo). */
export async function reorderOndaAction(input: { kind: "cases" | "packages"; keys: string[] }): Promise<Result> {
  await requireUser(EDITOR);
  const parsed = z.object({ kind: z.enum(["cases", "packages"]), keys: z.array(z.string().min(1).max(60)).max(200) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_admin_reorder", { p_kind: parsed.data.kind, p_keys: parsed.data.keys });
  if (error) return agencyFail(error);
  refresh();
  return { ok: true };
}
