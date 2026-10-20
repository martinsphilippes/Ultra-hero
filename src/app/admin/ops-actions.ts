"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { BAN_FOREVER, BAN_NONE, restoreBanDuration, suspensionBlock } from "@/components/admin-ops/account-status";
import type { FeedbackStatus } from "@/components/feedback/constants";
import { feedbackTriageSchema, type FeedbackTriageInput } from "@/components/feedback/schema";
import { isSignupRefusedByDatabase, readExperimentOpen } from "@/lib/auth/experiment";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { PILLARS, rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Ações administrativas de operação (usuários, convites, parceiros, feedback,
// configurações, retenção e contas demo). Tudo exige admin; as escritas críticas
// passam por RPCs auditadas. Erros voltam já traduzidos para o cliente exibir.

export type Result<T extends object = Record<never, never>> = ({ ok: true; message?: string } & T) | { ok: false; error: string };
type Failure = { ok: false; error: string };

const PLACEHOLDER_PATH = /^\/placeholders\/[a-z0-9-]+\.svg$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Mapeia códigos de RAISE EXCEPTION / Postgres para mensagens traduzidas.
async function fail(error: unknown): Promise<Failure> {
  const t = await getTranslations("adminOps.errors");
  let code = "generic";
  if (error && typeof error === "object" && "message" in error) {
    const pg = error as { code?: string; message?: string };
    if (pg.code === "23505") code = "slug_taken";
    else if (pg.code === "42501") code = "forbidden";
    else code = rpcErrorCode(pg.message);
  } else if (typeof error === "string") {
    code = error;
  }
  if (!t.has(code)) code = "generic";
  return { ok: false, error: t(code) };
}

async function invalid(): Promise<Failure> {
  const t = await getTranslations("adminOps.errors");
  return { ok: false, error: t("invalid_input") };
}

// Papel exigido fora de try/catch: requireRole redireciona (lança NEXT_REDIRECT) quando não é admin.
async function admin() {
  const { user } = await requireRole("admin", "/admin");
  return user;
}

const justificationSchema = z.string().trim().max(500);
const requiredJustification = z.string().trim().min(5).max(500);

// ---------------------------------------------------------------- usuários
const roleSchema = z.enum(["admin", "creator", "seller"]);

export async function setUserRole(input: { userId: string; role: "admin" | "creator" | "seller"; active: boolean }, justification: string): Promise<Result> {
  await admin();
  const parsed = z.object({ userId: z.uuid(), role: roleSchema, active: z.boolean(), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_role", {
      p_user: parsed.data.userId,
      p_role: parsed.data.role,
      p_active: parsed.data.active,
      p_justification: parsed.data.justification,
    });
    if (error) return fail(error);
    revalidatePath(`/admin/users/${parsed.data.userId}`);
    revalidatePath("/admin/users");
    const t = await getTranslations("adminOps.users.detail");
    return { ok: true, message: t("roleUpdated") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- suspensão de conta (service role + auditoria)
// O Auth (service role, só no servidor) aplica/remove o ban; o banco registra a mudança
// em nome do admin (admin_log_account_status). Sem auditoria, a mudança é desfeita.
export async function setAccountSuspended(input: { userId: string; suspended: boolean }, justification: string): Promise<Result> {
  const actor = await admin();
  if (!hasAdminClient()) return fail("no_service_role");
  const parsed = z.object({ userId: z.uuid(), suspended: z.boolean(), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  const { userId, suspended } = parsed.data;
  try {
    const supabase = await createClient();
    const { data: rows, error: readError } = await supabase.rpc("admin_get_user", { p_id: userId });
    if (readError) return fail(readError);
    const target = rows?.[0];
    if (!target) return fail("user_not_found");
    if (suspended) {
      const block = suspensionBlock({ targetId: userId, actorId: actor.id, roles: target.roles });
      if (block === "self") return fail("cannot_suspend_self");
      if (block === "admin") return fail("cannot_suspend_admin");
    }
    const previousBannedUntil = (target.banned_until as string | null | undefined) ?? null;

    const client = createAdminClient();
    const { error: banError } = await client.auth.admin.updateUserById(userId, { ban_duration: suspended ? BAN_FOREVER : BAN_NONE });
    if (banError) return fail("suspension_failed");

    const { error: logError } = await supabase.rpc("admin_log_account_status", {
      p_user: userId,
      p_suspended: suspended,
      p_justification: parsed.data.justification,
    });
    if (logError) {
      // Auditoria recusou: volta o Auth ao estado anterior para não haver mudança sem registro.
      const undone = await client.auth.admin
        .updateUserById(userId, { ban_duration: restoreBanDuration(previousBannedUntil) })
        .then(
          ({ error }) => !error,
          () => false,
        );
      if (!undone) {
        // Mudança aplicada no Auth sem auditoria e sem desfazer: precisa de atenção manual.
        console.error("[admin] suspensão aplicada no Auth sem auditoria; desfazer falhou", { userId, suspended, audit: logError.message });
        return fail("suspension_unaudited");
      }
      return fail(logError);
    }

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");
    const t = await getTranslations("adminOps.users.suspension");
    return { ok: true, message: suspended ? t("suspendedToast") : t("reactivatedToast") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- convites
const invitationSchema = z
  .object({
    email: z.email().max(254),
    role: z.enum(["creator", "seller"]),
    creatorProfileId: z.uuid().optional(),
    sellerOrgId: z.uuid().optional(),
    days: z.coerce.number().int().min(1).max(30),
  })
  .refine((v) => (v.role === "creator" ? Boolean(v.creatorProfileId) : Boolean(v.sellerOrgId)));

// Base pública para montar o link do convite: NEXT_PUBLIC_SITE_URL ou a origem da request.
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createInvitation(input: {
  email: string;
  role: "creator" | "seller";
  creatorProfileId?: string;
  sellerOrgId?: string;
  days: number;
}): Promise<Result<{ invitationId: string; link: string }>> {
  await admin();
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_create_invitation", {
      p_email: parsed.data.email.toLowerCase(),
      p_role: parsed.data.role,
      p_creator_profile_id: parsed.data.role === "creator" ? parsed.data.creatorProfileId : undefined,
      p_seller_org_id: parsed.data.role === "seller" ? parsed.data.sellerOrgId : undefined,
      p_days: parsed.data.days,
    });
    if (error) return fail(error);
    const row = data?.[0];
    if (!row) return fail("generic");
    // O token só existe aqui (o banco guarda o hash): o link é mostrado uma única vez.
    const link = `${await siteOrigin()}/invite?token=${encodeURIComponent(row.token)}`;
    revalidatePath("/admin/invitations");
    return { ok: true, invitationId: row.invitation_id, link };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeInvitation(input: { id: string }, justification: string): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_revoke_invitation", { p_id: parsed.data.id, p_justification: parsed.data.justification });
    if (error) return fail(error);
    revalidatePath("/admin/invitations");
    const t = await getTranslations("adminOps.invitations");
    return { ok: true, message: t("revoked") };
  } catch (error) {
    return fail(error);
  }
}

// Aceite pelo convidado (qualquer usuário autenticado; a RPC valida token, validade e e-mail).
export async function acceptInvitation(input: { token: string }): Promise<Result<{ role: "creator" | "seller" }>> {
  const parsed = z.object({ token: z.string().trim().min(16).max(256) }).safeParse(input);
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data.token });
    if (error) return fail(error);
    const role = data && typeof data === "object" && !Array.isArray(data) ? (data as { role?: string }).role : undefined;
    if (role !== "creator" && role !== "seller") return fail("generic");
    revalidatePath("/admin/invitations");
    return { ok: true, role };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- personalidades
// Direitos de nome e imagem (RF-003, RB-05): campos públicos em creator_profiles (auditados pelo
// trigger audit_partner_changes; só o admin altera) e documentação em creator_rights_private
// (só admin; gravada pela RPC auditada admin_set_creator_rights_private).
export const RIGHTS_STATUSES = ["fictional", "pending", "authorized"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const creatorSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().regex(SLUG).max(80),
    headline: z.string().trim().max(140).optional().or(z.literal("")),
    bio: z.string().trim().max(2000).optional().or(z.literal("")),
    pillars: z.array(z.enum(PILLARS as [string, ...string[]])).min(1).max(4),
    avatarUrl: z.string().regex(PLACEHOLDER_PATH),
    coverUrl: z.string().regex(PLACEHOLDER_PATH),
    isFictional: z.boolean(),
    rightsNote: z.string().trim().max(500).optional().or(z.literal("")),
    sortOrder: z.coerce.number().int().min(0).max(10000),
    rightsStatus: z.enum(RIGHTS_STATUSES).default("fictional"),
    rightsHolder: z.string().trim().max(160).optional().or(z.literal("")),
    rightsValidUntil: z.string().trim().regex(ISO_DATE).optional().or(z.literal("")),
    documentRef: z.string().trim().max(300).optional().or(z.literal("")),
    privateNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.rightsStatus === "authorized" && !v.rightsHolder) {
      ctx.addIssue({ code: "custom", message: "rights_holder_required", path: ["rightsHolder"] });
    }
  });

export type CreatorFormValues = z.input<typeof creatorSchema>;
type CreatorParsed = z.output<typeof creatorSchema>;

function creatorRow(v: CreatorParsed) {
  return {
    name: v.name,
    slug: v.slug,
    headline: v.headline || null,
    bio: v.bio || null,
    pillars: v.pillars as ("routine" | "training" | "nutrition" | "gastronomy")[],
    avatar_url: v.avatarUrl,
    cover_url: v.coverUrl,
    is_fictional: v.isFictional,
    rights_note: v.rightsNote || null,
    sort_order: v.sortOrder,
    rights_status: v.rightsStatus,
    rights_holder: v.rightsHolder || null,
    rights_valid_until: v.rightsValidUntil || null,
  };
}

async function creatorInvalid(parsed: { success: false; error: z.ZodError }): Promise<Failure> {
  const code = parsed.error.issues.find((i) => i.message === "rights_holder_required") ? "rights_holder_required" : "invalid_input";
  return fail(code);
}

// Só grava (e audita) a parte privada quando algo mudou; a RPC registra revisor e data.
async function savePrivateRights(supabase: Awaited<ReturnType<typeof createClient>>, creatorId: string, v: CreatorParsed): Promise<Failure | null> {
  const doc = v.documentRef || "";
  const notes = v.privateNotes || "";
  const { data: current } = await supabase.from("creator_rights_private").select("document_ref, notes").eq("creator_id", creatorId).maybeSingle();
  const unchanged = current ? (current.document_ref ?? "") === doc && (current.notes ?? "") === notes : doc === "" && notes === "";
  if (unchanged) return null;
  const { error } = await supabase.rpc("admin_set_creator_rights_private", { p_creator: creatorId, p_document_ref: doc, p_notes: notes });
  return error ? fail(error) : null;
}

export async function createCreator(input: CreatorFormValues): Promise<Result<{ id: string }>> {
  await admin();
  const parsed = creatorSchema.safeParse(input);
  if (!parsed.success) return creatorInvalid(parsed);
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("creator_profiles").insert(creatorRow(v)).select("id").single();
    if (error) return fail(error);
    const privateError = await savePrivateRights(supabase, data.id, v);
    revalidatePath("/admin/creators");
    if (privateError) return privateError;
    const t = await getTranslations("adminOps.creators.form");
    return { ok: true, id: data.id, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCreator(id: string, input: CreatorFormValues): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), values: creatorSchema }).safeParse({ id, values: input });
  if (!parsed.success) return creatorInvalid(parsed);
  const v = parsed.data.values;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("creator_profiles").update(creatorRow(v)).eq("id", parsed.data.id).select("id").maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    const privateError = await savePrivateRights(supabase, parsed.data.id, v);
    revalidatePath("/admin/creators");
    revalidatePath(`/admin/creators/${parsed.data.id}`);
    revalidatePath("/personalities");
    if (privateError) return privateError;
    const t = await getTranslations("adminOps.creators.form");
    return { ok: true, message: t("updated") };
  } catch (error) {
    return fail(error);
  }
}

export async function setCreatorStatus(input: { id: string; status: "active" | "suspended" }, justification: string): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "suspended"]), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_creator_status", {
      p_creator: parsed.data.id,
      p_status: parsed.data.status,
      p_justification: parsed.data.justification,
    });
    if (error) return fail(error);
    revalidatePath("/admin/creators");
    revalidatePath(`/admin/creators/${parsed.data.id}`);
    const t = await getTranslations("adminOps.creators.status");
    return { ok: true, message: t("updated") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- fornecedores
const sellerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(SLUG).max(80),
  kind: z.enum(["own", "partner"]),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  logoUrl: z.string().regex(PLACEHOLDER_PATH),
});

export type SellerFormValues = z.input<typeof sellerSchema>;

export async function createSeller(input: SellerFormValues): Promise<Result<{ id: string }>> {
  await admin();
  const parsed = sellerSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seller_organizations")
      .insert({ name: v.name, slug: v.slug, kind: v.kind, description: v.description || null, logo_url: v.logoUrl, is_fictional: true })
      .select("id")
      .single();
    if (error) return fail(error);
    revalidatePath("/admin/sellers");
    const t = await getTranslations("adminOps.sellers.form");
    return { ok: true, id: data.id, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSeller(id: string, input: SellerFormValues): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), values: sellerSchema }).safeParse({ id, values: input });
  if (!parsed.success) return invalid();
  const v = parsed.data.values;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seller_organizations")
      .update({ name: v.name, slug: v.slug, kind: v.kind, description: v.description || null, logo_url: v.logoUrl })
      .eq("id", parsed.data.id)
      .select("id")
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidatePath("/admin/sellers");
    revalidatePath(`/admin/sellers/${parsed.data.id}`);
    const t = await getTranslations("adminOps.sellers.form");
    return { ok: true, message: t("updated") };
  } catch (error) {
    return fail(error);
  }
}

export async function setSellerStatus(input: { id: string; status: "active" | "suspended" }, justification: string): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "suspended"]), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_seller_status", {
      p_org: parsed.data.id,
      p_status: parsed.data.status,
      p_justification: parsed.data.justification,
    });
    if (error) return fail(error);
    revalidatePath("/admin/sellers");
    revalidatePath(`/admin/sellers/${parsed.data.id}`);
    const t = await getTranslations("adminOps.sellers.status");
    return { ok: true, message: t("updated") };
  } catch (error) {
    return fail(error);
  }
}

// Revoga a operação do membro (RLS permite ao admin). O histórico da adesão é mantido.
export async function revokeMembership(input: { membershipId: string; orgId: string }, justification: string): Promise<Result> {
  await admin();
  const parsed = z.object({ membershipId: z.uuid(), orgId: z.uuid(), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seller_memberships")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.data.membershipId)
      .eq("org_id", parsed.data.orgId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidatePath(`/admin/sellers/${parsed.data.orgId}`);
    const t = await getTranslations("adminOps.sellers.memberships");
    return { ok: true, message: t("revoked") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- feedback
// Triagem (status, prioridade, responsável, nota interna) pela RPC admin_triage_feedback:
// confere is_admin de novo, valida cada campo e grava admin_audit com action 'feedback.triage'.
export async function triageFeedback(input: FeedbackTriageInput): Promise<Result> {
  await admin();
  const parsed = feedbackTriageSchema.safeParse(input);
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_triage_feedback", {
      p_id: parsed.data.id,
      p_patch: parsed.data.patch,
      p_justification: parsed.data.justification || undefined,
    });
    if (error) return fail(error);
    revalidatePath("/admin/feedback");
    revalidatePath("/admin/audit");
    revalidatePath("/admin");
    const t = await getTranslations("adminOps.feedback");
    return { ok: true, message: t("updated") };
  } catch (error) {
    return fail(error);
  }
}

export async function setFeedbackStatus(input: { id: string; status: FeedbackStatus }): Promise<Result> {
  return triageFeedback({ id: input.id, patch: { status: input.status } });
}

// ---------------------------------------------------------------- configurações
// Chaves conhecidas e o formato aceito para cada uma (o cliente só escolhe; o servidor valida).
const SETTING_SCHEMAS = {
  "commerce.enabled": z.boolean(),
  "ai.enabled": z.boolean(),
  "ai.provider": z.enum(["deterministic", "openai", "gemini"]),
  "ai.rate_limit_per_hour": z.coerce.number().int().min(0).max(1000),
  "experiment.open": z.boolean(),
  "transport.minutes_per_step": z.coerce.number().int().min(0).max(10080),
  "video.provider": z.enum(["embed", "cloudflare_stream", "mux"]),
  bootstrap_admin_emails: z.array(z.email().max(254)).max(20),
} as const;

export type EditableSettingKey = keyof typeof SETTING_SCHEMAS;
const KILL_SWITCHES: EditableSettingKey[] = ["commerce.enabled", "ai.enabled", "experiment.open"];

export async function setSetting(input: { key: EditableSettingKey; value: unknown }, justification: string): Promise<Result> {
  await admin();
  const schema = SETTING_SCHEMAS[input?.key as EditableSettingKey];
  if (!schema) return invalid();
  const needsJustification = KILL_SWITCHES.includes(input.key) || input.key === "bootstrap_admin_emails";
  const parsed = z
    .object({ value: schema, justification: needsJustification ? requiredJustification : justificationSchema })
    .safeParse({ value: input.value, justification });
  if (!parsed.success) return invalid();
  const value = (Array.isArray(parsed.data.value) ? parsed.data.value.map((e) => e.toLowerCase()) : parsed.data.value) as Json;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_setting", {
      p_key: input.key,
      p_value: value,
      p_justification: parsed.data.justification || undefined,
    });
    if (error) return fail(error);
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    const t = await getTranslations("adminOps.settings");
    return { ok: true, message: t("updated") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- operações
export type RetentionCounts = { analytics: number; orders: number; audit: number; runs: number };

export async function runRetention(): Promise<Result<{ counts: RetentionCounts }>> {
  await admin();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_run_retention");
    if (error) return fail(error);
    const r = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
    const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/audit");
    return {
      ok: true,
      counts: { analytics: n("analytics_deleted"), orders: n("orders_anonymized"), audit: n("audit_deleted"), runs: n("recommendation_runs_deleted") },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function advanceTransport(input: { minutes: number }): Promise<Result<{ advanced: number }>> {
  await admin();
  const parsed = z.object({ minutes: z.coerce.number().int().min(0).max(10080) }).safeParse(input);
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_advance_transport", { p_minutes: parsed.data.minutes });
    if (error) return fail(error);
    revalidatePath("/admin");
    return { ok: true, advanced: typeof data === "number" ? data : 0 };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- exceções de retenção
const exceptionSchema = z.object({
  scopeType: z.enum(["user", "test_order"]),
  scopeId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(5).max(1000),
  ownerId: z.uuid().optional().or(z.literal("")),
  reviewAt: z.iso.date(),
});

export type RetentionExceptionValues = z.input<typeof exceptionSchema>;

export async function createRetentionException(input: RetentionExceptionValues): Promise<Result> {
  const user = await admin();
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("retention_exceptions").insert({
      scope_type: v.scopeType,
      scope_id: v.scopeId,
      reason: v.reason,
      owner_id: v.ownerId || user.id,
      review_at: v.reviewAt,
      created_by: user.id,
    });
    if (error) return fail(error);
    revalidatePath("/admin/settings");
    const t = await getTranslations("adminOps.settings.retention");
    return { ok: true, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function closeRetentionException(input: { id: string }, justification: string): Promise<Result> {
  await admin();
  const parsed = z.object({ id: z.uuid(), justification: requiredJustification }).safeParse({ ...input, justification });
  if (!parsed.success) return invalid();
  try {
    const supabase = await createClient();
    // A justificativa fica anexada ao motivo (a tabela não tem coluna própria e o audit_log não é exposto à API).
    const { data: current } = await supabase.from("retention_exceptions").select("reason").eq("id", parsed.data.id).maybeSingle();
    const reason = current ? `${current.reason}\n[closed] ${parsed.data.justification}`.slice(0, 2000) : undefined;
    const { data, error } = await supabase
      .from("retention_exceptions")
      .update({ closed_at: new Date().toISOString(), ...(reason ? { reason } : {}) })
      .eq("id", parsed.data.id)
      .is("closed_at", null)
      .select("id")
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidatePath("/admin/settings");
    const t = await getTranslations("adminOps.settings.retention");
    return { ok: true, message: t("closedToast") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- contas demo (service role)
const demoAccountSchema = z
  .object({
    email: z.email().max(254),
    role: z.enum(["seller", "creator"]),
    orgId: z.uuid().optional().or(z.literal("")),
    profileId: z.uuid().optional().or(z.literal("")),
  })
  .refine((v) => (v.role === "seller" ? Boolean(v.orgId) : Boolean(v.profileId)));

// Senha aleatória de 16 caracteres (alfabeto sem ambiguidades). Nunca é registrada em log.
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function createDemoAccount(input: { email: string; role: "seller" | "creator"; orgId?: string; profileId?: string }): Promise<Result<{ userId: string; password: string }>> {
  const actor = await admin();
  if (!hasAdminClient()) return fail("no_service_role");
  const parsed = demoAccountSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const v = parsed.data;
  try {
    const client = createAdminClient();
    const password = generatePassword();
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email: v.email.toLowerCase(),
      password,
      email_confirm: true,
      // Marcador gravável só pela service role: libera a conta demo mesmo com o cadastro público fechado (0015).
      app_metadata: { ultra_hero_demo: true },
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? "";
      if (/already|exists|registered/i.test(msg)) return fail("user_exists");
      // Cadastro fechado (experiment.open): o banco só aceita convidados/bootstrap, inclusive aqui.
      if (isSignupRefusedByDatabase(createError) && !(await readExperimentOpen(await createClient()))) return fail("experiment_closed");
      return fail("generic");
    }
    const userId = created.user.id;

    if (v.role === "seller") {
      const orgId = v.orgId as string;
      const { error: mErr } = await client.from("seller_memberships").upsert({ org_id: orgId, user_id: userId, role: "owner", revoked_at: null }, { onConflict: "org_id,user_id" });
      if (mErr) return fail(mErr);
      const { error: rErr } = await client
        .from("role_assignments")
        .upsert({ user_id: userId, role: "seller", scope_type: "seller_org", scope_id: orgId, granted_by: actor.id, revoked_at: null }, { onConflict: "user_id,role,scope_id" });
      if (rErr) return fail(rErr);
    } else {
      const profileId = v.profileId as string;
      const { data: linked, error: lErr } = await client.from("creator_profiles").update({ user_id: userId }).eq("id", profileId).is("user_id", null).select("id").maybeSingle();
      if (lErr) return fail(lErr);
      if (!linked) return fail("creator_profile_already_linked");
      const { error: rErr } = await client
        .from("role_assignments")
        .upsert({ user_id: userId, role: "creator", scope_type: "creator", scope_id: profileId, granted_by: actor.id, revoked_at: null }, { onConflict: "user_id,role,scope_id" });
      if (rErr) return fail(rErr);
    }

    // Auditoria via RPC (service role tem grant); a senha nunca entra aqui.
    await client.rpc("audit_log", {
      p_action: "demo_account.create",
      p_resource_type: "user",
      p_resource_id: userId,
      p_after: { email: v.email.toLowerCase(), role: v.role, scope_id: v.role === "seller" ? v.orgId : v.profileId, created_by: actor.id },
      p_actor_type: "admin",
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/settings");
    return { ok: true, userId, password };
  } catch (error) {
    return fail(error);
  }
}
