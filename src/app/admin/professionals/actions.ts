"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { demoPassword } from "@/lib/demo/server";
import { PROFESSIONAL_DEMO_EMAIL } from "@/lib/demo/accounts";
import { PROFESSIONAL_STATUSES, validServiceShape } from "@/lib/professionals/rules";
import { adminProfileSchema, serviceSchema, splitCities, type AdminProfileValues, type ServiceValues } from "@/lib/professionals/schemas";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Profissionais no admin (0058): perfil, aprovação (registro conferido + nota), serviços e preços,
// sugeridos (herói, receita, programa), convite da conta e a conta de acesso rápido do exemplo.
// Toda escrita passa por RPC auditada (admin_audit); aqui só a forma e a tradução do erro.

type Result<T extends object = Record<never, never>> = ({ ok: true; message: string } & T) | { ok: false; error: string };

const CODES = [
  "forbidden",
  "not_found",
  "registry_not_verified",
  "note_required",
  "note_too_long",
  "invalid_status",
  "invalid_target",
  "invalid_service",
  "professional_already_linked",
  "invalid_transition",
  "order_closed",
] as const;

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("professionals.errors");
  const raw = error as { code?: string; message?: string } | string | null;
  const message = typeof raw === "string" ? raw : (raw?.message ?? "");
  if (typeof raw === "object" && raw?.code === "23505") return { ok: false, error: t("slug_taken") };
  const code = CODES.find((c) => message.includes(c)) ?? (message.includes("_check") || message.includes("violates") ? "invalid_input" : "generic");
  return { ok: false, error: t(code) };
}

// Papel exigido fora do try: requireRole redireciona quando não é admin.
async function admin() {
  const { user } = await requireRole("admin", "/admin");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/admin/professionals");
  if (id) revalidatePath(`/admin/professionals/${id}`);
  revalidatePath("/profissionais", "layout");
}

export async function saveProfessionalAdmin(id: string | null, input: AdminProfileValues): Promise<Result<{ id?: string }>> {
  await admin();
  const parsedId = z.uuid().nullable().safeParse(id);
  const parsed = adminProfileSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_professional_save", {
      p_id: parsedId.data ?? undefined,
      p_data: { ...parsed.data, cities: splitCities(parsed.data.cities) },
    });
    if (error || !data) return fail(error ?? "generic");
    revalidate(data);
    const t = await getTranslations("professionals.admin.form");
    return { ok: true, id: data, message: parsedId.data ? t("saved") : t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function setProfessionalStatus(input: { id: string; status: string; verified: boolean; note: string }): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), status: z.enum(PROFESSIONAL_STATUSES), verified: z.boolean(), note: z.string().trim().max(1000) }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_professional_set_status", {
      p_id: parsed.data.id,
      p_status: parsed.data.status,
      p_verified: parsed.data.verified,
      p_note: parsed.data.note || undefined,
    });
    if (error) return fail(error);
    revalidate(parsed.data.id);
    const t = await getTranslations("professionals.admin.status");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

export async function saveProfessionalServiceAdmin(professionalId: string, id: string | null, input: ServiceValues & { admin_disabled?: boolean; note?: string }): Promise<Result<{ id?: string }>> {
  await admin();
  const ids = z.object({ professionalId: z.uuid(), id: z.uuid().nullable() }).safeParse({ professionalId, id });
  const parsed = serviceSchema.extend({ admin_disabled: z.boolean().default(false), note: z.string().trim().max(500).default("") }).safeParse(input);
  if (!ids.success || !parsed.success) return fail("invalid_service");
  const v = parsed.data;
  if (!validServiceShape({ kind: v.kind, mode: v.mode, durationMinutes: v.duration_minutes, planWeeks: v.kind === "plan" ? v.plan_weeks : null })) return fail("invalid_service");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_professional_service_save", { p_id: ids.data.id ?? undefined, p_professional: ids.data.professionalId, p_data: v });
    if (error || !data) return fail(error ?? "generic");
    revalidate(ids.data.professionalId);
    const t = await getTranslations("professionals.portal.services");
    return { ok: true, id: data, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

export async function setProfessionalSuggestion(input: { professionalId: string; target: "creator" | "content" | "program"; targetId: string; on: boolean }): Promise<Result> {
  await admin();
  const parsed = z.object({ professionalId: z.uuid(), target: z.enum(["creator", "content", "program"]), targetId: z.uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("invalid_target");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_professional_suggestion_set", {
      p_professional: parsed.data.professionalId,
      p_target: parsed.data.target,
      p_target_id: parsed.data.targetId,
      p_on: parsed.data.on,
    });
    if (error) return fail(error);
    revalidate(parsed.data.professionalId);
    const t = await getTranslations("professionals.admin.suggestions");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

// Base pública para o link do convite (mesma regra de ops-actions).
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Convite para a pessoa assumir o perfil (o link aparece só uma vez; o banco guarda o hash). */
export async function inviteProfessional(input: { professionalId: string; email: string; days: number }): Promise<Result<{ link?: string }>> {
  await admin();
  const parsed = z.object({ professionalId: z.uuid(), email: z.email().max(254), days: z.number().int().min(1).max(30) }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_invite_professional", {
      p_email: parsed.data.email.toLowerCase(),
      p_professional: parsed.data.professionalId,
      p_days: parsed.data.days,
    });
    if (error) return fail(error);
    const row = data?.[0];
    if (!row) return fail("generic");
    revalidatePath("/admin/invitations");
    const t = await getTranslations("professionals.admin.invite");
    return { ok: true, link: `${await siteOrigin()}/invite?token=${encodeURIComponent(row.token)}`, message: t("linkTitle") };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Conta de acesso rápido do profissional de exemplo (painel de contas da tela de login): cria
 * PROFESSIONAL_DEMO_EMAIL com a senha das contas de acesso rápido (DEMO_ACCOUNTS_PASSWORD, só no
 * servidor), liga ao perfil e grava o papel. Só para perfil de exemplo (is_demo) sem conta.
 */
export async function createProfessionalDemoLogin(input: { professionalId: string }): Promise<Result> {
  const actor = await admin();
  const parsed = z.object({ professionalId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const password = demoPassword();
  if (!hasAdminClient() || !password) return fail("forbidden");
  try {
    const client = createAdminClient();
    const { data: pro } = await client.from("professionals").select("id, user_id, is_demo, status").eq("id", parsed.data.professionalId).maybeSingle();
    if (!pro || !pro.is_demo) return fail("not_found");
    if (pro.user_id) return fail("professional_already_linked");
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email: PROFESSIONAL_DEMO_EMAIL,
      password,
      email_confirm: true,
      app_metadata: { ultra_hero_demo: true },
      user_metadata: { full_name: "Profissional" },
    });
    if (createError || !created.user) return fail("professional_already_linked");
    const userId = created.user.id;
    const { error: linkError } = await client.from("professionals").update({ user_id: userId }).eq("id", pro.id).is("user_id", null);
    if (linkError) return fail(linkError);
    const { error: roleError } = await client
      .from("role_assignments")
      .upsert({ user_id: userId, role: "professional", scope_type: "professional", scope_id: pro.id, granted_by: actor.id, revoked_at: null }, { onConflict: "user_id,role,scope_id" });
    if (roleError) return fail(roleError);
    await client.rpc("audit_log", {
      p_action: "demo_account.create",
      p_resource_type: "user",
      p_resource_id: userId,
      p_after: { email: PROFESSIONAL_DEMO_EMAIL, role: "professional", scope_id: pro.id, created_by: actor.id },
      p_actor_type: "admin",
    });
    revalidate(pro.id);
    const t = await getTranslations("professionals.admin.demoLogin");
    return { ok: true, message: t("done") };
  } catch (error) {
    return fail(error);
  }
}
