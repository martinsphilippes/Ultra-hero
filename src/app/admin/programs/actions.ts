"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { slugify } from "@/components/admin-content/lib/slug";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { programConceptSchema } from "@/lib/programs/concept";
import { PROGRAM_ITEM_FOREIGN_CONTENT, canUseInProgram } from "@/lib/programs/item-ownership";
import { createClient } from "@/lib/supabase/server";

// Ações administrativas de programas versionados. Versões publicadas têm itens congelados;
// alterações passam por nova versão ou substituição auditada (RPCs do banco).

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
  return user.id;
}

function revalidateProgram(programId: string, versionId?: string) {
  revalidatePath("/admin/programs");
  revalidatePath(`/admin/programs/${programId}`);
  if (versionId) revalidatePath(`/admin/programs/${programId}/versions/${versionId}`);
}

// ---------------------------------------------------------------- programa ----
const programBasics = z.object({
  slug: z.string().trim().min(3).max(80).transform(slugify),
  creator_id: uuid.nullable(),
  pillar: z.enum(["routine", "training", "nutrition", "gastronomy"]),
  cover_url: z.string().trim().max(500),
});

const firstVersion = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(600),
  estimated_weeks: z.number().int().min(1).max(104).nullable(),
});

export type CreateProgramInput = z.infer<typeof programBasics> & z.infer<typeof firstVersion>;

export async function createProgramAction(input: CreateProgramInput): Promise<ActionResult & { id?: string }> {
  const basics = programBasics.safeParse(input);
  const version = firstVersion.safeParse(input);
  if (!basics.success || !version.success) return fail("invalid_input");
  try {
    const userId = await requireAdmin();
    const supabase = await createClient();
    const { data: program, error } = await supabase
      .from("programs")
      .insert({ slug: basics.data.slug, creator_id: basics.data.creator_id, pillar: basics.data.pillar, cover_url: basics.data.cover_url || null, status: "draft", created_by: userId })
      .select("id")
      .single();
    if (error || !program) return fail(error ?? "generic");

    const { data: versionId, error: vError } = await supabase.rpc("admin_create_program_version", { p_program: program.id });
    if (vError || !versionId) return fail(vError ?? "generic");
    const { error: uError } = await supabase
      .from("program_versions")
      .update({ title: version.data.title, summary: version.data.summary || null, estimated_weeks: version.data.estimated_weeks })
      .eq("id", versionId);
    if (uError) return fail(uError);

    revalidateProgram(program.id, versionId);
    const t = await getTranslations("adminContent.programs.create");
    return { ok: true, id: program.id, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function updateProgramAction(programId: string, input: z.infer<typeof programBasics>): Promise<ActionResult> {
  const id = uuid.safeParse(programId);
  const basics = programBasics.safeParse(input);
  if (!id.success || !basics.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("programs")
      .update({ slug: basics.data.slug, creator_id: basics.data.creator_id, pillar: basics.data.pillar, cover_url: basics.data.cover_url || null })
      .eq("id", id.data);
    if (error) return fail(error);
    revalidateProgram(id.data);
    const t = await getTranslations("adminContent.programs.detail");
    return { ok: true, message: t("basicsSaved") };
  } catch (error) {
    return fail(error);
  }
}

// Arquivar/reativar programa (sem RPC própria: update direto sob RLS de admin).
export async function setProgramStatusAction(programId: string, status: "draft" | "archived", justification: string): Promise<ActionResult> {
  const parsed = z.object({ programId: uuid, status: z.enum(["draft", "archived"]), justification: z.string().trim().min(5).max(500) }).safeParse({ programId, status, justification });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("programs").update({ status: parsed.data.status }).eq("id", parsed.data.programId);
    if (error) return fail(error);
    revalidateProgram(parsed.data.programId);
    revalidatePath("/admin/featured");
    const t = await getTranslations("adminContent.programs.detail");
    return { ok: true, message: t("archived") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- versões -----
export async function createVersionAction(programId: string, copyFrom: string | null): Promise<ActionResult & { id?: string }> {
  const parsed = z.object({ programId: uuid, copyFrom: uuid.nullable() }).safeParse({ programId, copyFrom });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_create_program_version", { p_program: parsed.data.programId, p_copy_from: parsed.data.copyFrom ?? undefined });
    if (error || !data) return fail(error ?? "generic");
    revalidateProgram(parsed.data.programId, data);
    const t = await getTranslations("adminContent.programs.detail");
    return { ok: true, id: data, message: t("versionCreated") };
  } catch (error) {
    return fail(error);
  }
}

const CERT_FIELDS = ["display_name", "program_title", "completed_at", "version", "pillar"] as const;

const versionFields = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(600),
  description: z.string().trim().max(4000),
  estimated_weeks: z.number().int().min(1).max(104).nullable(),
  certificate_fields: z.array(z.enum(CERT_FIELDS)).max(CERT_FIELDS.length),
});

export type VersionFieldsInput = z.infer<typeof versionFields>;

export async function saveVersionFieldsAction(programId: string, versionId: string, input: VersionFieldsInput): Promise<ActionResult> {
  const ids = z.object({ programId: uuid, versionId: uuid }).safeParse({ programId, versionId });
  const parsed = versionFields.safeParse(input);
  if (!ids.success || !parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("program_versions")
      .update({
        title: parsed.data.title,
        summary: parsed.data.summary || null,
        description: parsed.data.description || null,
        estimated_weeks: parsed.data.estimated_weeks,
        certificate_fields: parsed.data.certificate_fields,
      })
      .eq("id", ids.data.versionId)
      .eq("program_id", ids.data.programId);
    if (error) return fail(error);
    revalidateProgram(ids.data.programId, ids.data.versionId);
    const t = await getTranslations("adminContent.programs.version");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

// Conceito (0048): null remove; editável mesmo com a versão publicada, como os demais textos.
export async function saveVersionConceptAction(programId: string, versionId: string, concept: unknown): Promise<ActionResult> {
  const ids = z.object({ programId: uuid, versionId: uuid }).safeParse({ programId, versionId });
  const parsed = programConceptSchema.nullable().safeParse(concept);
  if (!ids.success || !parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("program_versions").update({ concept: parsed.data }).eq("id", ids.data.versionId).eq("program_id", ids.data.programId);
    if (error) return fail(error);
    revalidateProgram(ids.data.programId, ids.data.versionId);
    const t = await getTranslations("adminContent.programs.concept");
    return { ok: true, message: parsed.data ? t("saved") : t("cleared") };
  } catch (error) {
    return fail(error);
  }
}

export async function publishVersionAction(programId: string, versionId: string): Promise<ActionResult> {
  const ids = z.object({ programId: uuid, versionId: uuid }).safeParse({ programId, versionId });
  if (!ids.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_publish_program_version", { p_version: ids.data.versionId });
    if (error) return fail(error);
    revalidateProgram(ids.data.programId, ids.data.versionId);
    revalidatePath("/inicio");
    const t = await getTranslations("adminContent.programs.version");
    return { ok: true, message: t("published") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- itens -------
// Itens só mudam em versão rascunho (versão publicada = histórico congelado para quem já entrou).
async function assertDraftVersion(supabase: Awaited<ReturnType<typeof createClient>>, versionId: string): Promise<void> {
  const { data } = await supabase.from("program_versions").select("status").eq("id", versionId).maybeSingle();
  if (!data) throw new Error("version_not_found");
  if (data.status !== "draft") throw new Error("version_published_readonly");
}

// Reescreve posições 1..n na ordem dada (ordem é livre para o participante; serve só à apresentação).
async function rewritePositions(supabase: Awaited<ReturnType<typeof createClient>>, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("program_items").update({ position: i + 1 }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}

// Etapa do programa do herói só com conteúdo do próprio herói (0052; o gatilho do banco também garante,
// isto só dá a mensagem certa antes de tentar gravar).
async function assertProgramOwnsContent(supabase: Awaited<ReturnType<typeof createClient>>, programId: string, versionId: string, contentId: string): Promise<void> {
  const [{ data: version }, { data: content }] = await Promise.all([
    supabase.from("program_versions").select("program:programs(creator_id)").eq("id", versionId).eq("program_id", programId).maybeSingle(),
    supabase.from("content").select("creator_id").eq("id", contentId).maybeSingle(),
  ]);
  if (!version) throw new Error("version_not_found");
  if (!content) throw new Error("content_not_found");
  const program = (Array.isArray(version.program) ? version.program[0] : version.program) as { creator_id: string | null } | null;
  if (!canUseInProgram(program?.creator_id ?? null, content.creator_id)) throw new Error(PROGRAM_ITEM_FOREIGN_CONTENT);
}

export async function addItemAction(programId: string, versionId: string, contentId: string, section: string | null): Promise<ActionResult> {
  const parsed = z.object({ programId: uuid, versionId: uuid, contentId: uuid, section: z.string().trim().max(60).nullable() }).safeParse({ programId, versionId, contentId, section });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    await assertDraftVersion(supabase, parsed.data.versionId);
    await assertProgramOwnsContent(supabase, parsed.data.programId, parsed.data.versionId, parsed.data.contentId);
    const { data: last } = await supabase.from("program_items").select("position").eq("version_id", parsed.data.versionId).order("position", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("program_items").insert({
      version_id: parsed.data.versionId,
      content_id: parsed.data.contentId,
      position: (last?.position ?? 0) + 1,
      section: parsed.data.section || null,
      is_required: true,
    });
    if (error) return fail(error);
    revalidateProgram(parsed.data.programId, parsed.data.versionId);
    const t = await getTranslations("adminContent.programs.version");
    return { ok: true, message: t("itemAdded") };
  } catch (error) {
    return fail(error);
  }
}

export async function updateItemAction(programId: string, versionId: string, itemId: string, patch: { section?: string | null; is_required?: boolean }): Promise<ActionResult> {
  const parsed = z
    .object({ programId: uuid, versionId: uuid, itemId: uuid, patch: z.object({ section: z.string().trim().max(60).nullable().optional(), is_required: z.boolean().optional() }) })
    .safeParse({ programId, versionId, itemId, patch });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    await assertDraftVersion(supabase, parsed.data.versionId);
    const update: { section?: string | null; is_required?: boolean } = {};
    if (parsed.data.patch.section !== undefined) update.section = parsed.data.patch.section || null;
    if (parsed.data.patch.is_required !== undefined) update.is_required = parsed.data.patch.is_required;
    const { error } = await supabase.from("program_items").update(update).eq("id", parsed.data.itemId).eq("version_id", parsed.data.versionId);
    if (error) return fail(error);
    revalidateProgram(parsed.data.programId, parsed.data.versionId);
    const t = await getTranslations("adminContent.programs.version");
    return { ok: true, message: t("itemUpdated") };
  } catch (error) {
    return fail(error);
  }
}

export async function moveItemAction(programId: string, versionId: string, itemId: string, direction: "up" | "down"): Promise<ActionResult> {
  const parsed = z.object({ programId: uuid, versionId: uuid, itemId: uuid, direction: z.enum(["up", "down"]) }).safeParse({ programId, versionId, itemId, direction });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    await assertDraftVersion(supabase, parsed.data.versionId);
    const { data, error } = await supabase.from("program_items").select("id").eq("version_id", parsed.data.versionId).order("position").order("id");
    if (error) return fail(error);
    const ids = (data ?? []).map((r) => r.id);
    const index = ids.indexOf(parsed.data.itemId);
    if (index === -1) return fail("item_not_found");
    const target = parsed.data.direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return { ok: true };
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await rewritePositions(supabase, ids);
    revalidateProgram(parsed.data.programId, parsed.data.versionId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeItemAction(programId: string, versionId: string, itemId: string): Promise<ActionResult> {
  const parsed = z.object({ programId: uuid, versionId: uuid, itemId: uuid }).safeParse({ programId, versionId, itemId });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    await assertDraftVersion(supabase, parsed.data.versionId);
    const { error } = await supabase.from("program_items").delete().eq("id", parsed.data.itemId).eq("version_id", parsed.data.versionId);
    if (error) return fail(error);
    revalidateProgram(parsed.data.programId, parsed.data.versionId);
    const t = await getTranslations("adminContent.programs.version");
    return { ok: true, message: t("itemRemoved") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- substituições
export async function substituteItemAction(programId: string, versionId: string, originalId: string, replacementId: string, reason: string): Promise<ActionResult> {
  const parsed = z
    .object({ programId: uuid, versionId: uuid, originalId: uuid, replacementId: uuid, reason: z.string().trim().min(5).max(500) })
    .safeParse({ programId, versionId, originalId, replacementId, reason });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    await assertProgramOwnsContent(supabase, parsed.data.programId, parsed.data.versionId, parsed.data.replacementId);
    const { error } = await supabase.rpc("admin_substitute_program_item", {
      p_version: parsed.data.versionId,
      p_original: parsed.data.originalId,
      p_replacement: parsed.data.replacementId,
      p_reason: parsed.data.reason,
    });
    if (error) return fail(error);
    revalidateProgram(parsed.data.programId, parsed.data.versionId);
    const t = await getTranslations("adminContent.programs.version");
    return { ok: true, message: t("substituted") };
  } catch (error) {
    return fail(error);
  }
}
