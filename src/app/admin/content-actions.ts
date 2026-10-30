"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { escapeLike } from "@/components/admin-content/lib/search-params";
import { slugWithSuffix } from "@/components/admin-content/lib/slug";
import { parsePublishAt } from "@/components/admin-content/lib/publish-at";
import { reviewChangeAllowed } from "@/components/admin-content/lib/review-required";
import { failWith } from "@/components/admin-content/lib/translate-error";
import type { PickResult } from "@/components/admin-content/SearchPicker";
import { parseContentForm } from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { schedulePushDispatch } from "@/lib/push/schedule";

// Ações administrativas de conteúdo: revisão editorial, status, destaque, edição completa
// (content + content_bodies) e padrões de conclusão por tipo. Regras ficam nas RPCs/RLS;
// aqui só validamos entrada (Zod), traduzimos erros e revalidamos rotas.

// ---------------------------------------------------------------- helpers ---
const fail = failWith;

// Camada extra ao RLS/RPC: evita round-trip inútil quando a sessão não é admin.
async function requireAdmin(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
  return user.id;
}

// IDs RFC 4122: inclui os do seed (public.seed_uuid gera versão/variante válidas em 0008).
const uuid = z.uuid();

// Agendamento (RF-007): "Publicar em" opcional, ISO, no futuro. Vazio = publicar agora.
// O banco repete a regra (data passada = agora) e grava publish_at/published_at.
const publishAtInput = z.string().trim().max(40).nullable().optional();

// ---------------------------------------------------------------- revisão editorial
export async function reviewContentAction(
  contentId: string,
  decision: "approved" | "returned" | "rejected",
  feedback: string,
  publishAt?: string | null,
): Promise<ActionResult> {
  const parsed = z
    .object({ contentId: uuid, decision: z.enum(["approved", "returned", "rejected"]), feedback: z.string().trim().max(2000), publishAt: publishAtInput })
    .safeParse({ contentId, decision, feedback, publishAt });
  if (!parsed.success) return fail("invalid_input");
  const schedule = parsed.data.decision === "approved" ? parsePublishAt(parsed.data.publishAt) : ({ ok: true, value: null } as const);
  if (!schedule.ok) return fail(schedule.error);
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = schedule.value
      ? await supabase.rpc("admin_review_content", {
          p_content: parsed.data.contentId,
          p_decision: parsed.data.decision,
          p_feedback: parsed.data.feedback || "",
          p_publish_at: schedule.value,
        })
      : await supabase.rpc("admin_review_content", {
          p_content: parsed.data.contentId,
          p_decision: parsed.data.decision,
          p_feedback: parsed.data.feedback || undefined,
        });
    if (error) return fail(error);
    // aprovado para agora: avisa quem favoritou o herói (agendado sai no cron; 0054)
    if (parsed.data.decision === "approved" && !schedule.value) schedulePushDispatch();
    revalidatePath("/admin/content");
    revalidatePath(`/admin/content/${parsed.data.contentId}`);
    const t = await getTranslations("adminContent.content.review");
    return { ok: true, message: schedule.value ? t("scheduled") : t(parsed.data.decision) };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- status (publicar/agendar/arquivar/rascunho)
export async function setContentStatusAction(
  contentId: string,
  status: "draft" | "published" | "archived",
  justification: string,
  publishAt?: string | null,
): Promise<ActionResult> {
  const parsed = z
    .object({ contentId: uuid, status: z.enum(["draft", "published", "archived"]), justification: z.string().trim().min(5).max(500), publishAt: publishAtInput })
    .safeParse({ contentId, status, justification, publishAt });
  if (!parsed.success) return fail("invalid_input");
  const schedule = parsed.data.status === "published" ? parsePublishAt(parsed.data.publishAt) : ({ ok: true, value: null } as const);
  if (!schedule.ok) return fail(schedule.error);
  try {
    await requireAdmin();
    const supabase = await createClient();
    // Receita no ar não volta a rascunho na fase 1: as antigas não cumprem a lista de publicação
    // (recipe_incomplete) e não há editor para corrigir. Arquivar segue como retirada de segurança.
    if (parsed.data.status === "draft") {
      const { data: current } = await supabase.from("content").select("type, status").eq("id", parsed.data.contentId).maybeSingle();
      if (current?.type === "recipe" && current.status === "published") return fail("recipe_editor_pending");
    }
    // Sem data (ou "publicar agora"): a versão de 3 parâmetros limpa o agendamento.
    const { error } = schedule.value
      ? await supabase.rpc("admin_set_content_status", {
          p_content: parsed.data.contentId,
          p_status: parsed.data.status,
          p_justification: parsed.data.justification,
          p_publish_at: schedule.value,
        })
      : await supabase.rpc("admin_set_content_status", {
          p_content: parsed.data.contentId,
          p_status: parsed.data.status,
          p_justification: parsed.data.justification,
        });
    if (error) return fail(error);
    if (parsed.data.status === "published" && !schedule.value) schedulePushDispatch();
    revalidatePath("/admin/content");
    revalidatePath(`/admin/content/${parsed.data.contentId}`);
    revalidatePath("/admin/featured");
    const t = await getTranslations("adminContent.content.statusActions");
    return { ok: true, message: schedule.value ? t("scheduled") : t("changed") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- destaque (conteúdo ou programa)
export async function setFeaturedAction(kind: "content" | "program", id: string, featured: boolean, rank: number | null): Promise<ActionResult> {
  const parsed = z
    .object({ kind: z.enum(["content", "program"]), id: uuid, featured: z.boolean(), rank: z.number().int().min(1).max(999).nullable() })
    .safeParse({ kind, id, featured, rank });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    let nextRank = parsed.data.rank;
    // Sem posição informada ao destacar: entra no fim da lista.
    if (parsed.data.featured && nextRank === null) {
      const table = parsed.data.kind === "content" ? "content" : "programs";
      const { data } = await supabase.from(table).select("featured_rank").eq("is_featured", true).order("featured_rank", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      nextRank = (data?.featured_rank ?? 0) + 1;
    }
    const { error } = await supabase.rpc("admin_set_featured", {
      p_kind: parsed.data.kind,
      p_id: parsed.data.id,
      p_featured: parsed.data.featured,
      p_rank: parsed.data.featured ? (nextRank ?? undefined) : undefined,
    });
    if (error) return fail(error);
    revalidatePath("/admin/featured");
    revalidatePath(parsed.data.kind === "content" ? `/admin/content/${parsed.data.id}` : `/admin/programs/${parsed.data.id}`);
    revalidatePath("/inicio");
    const t = await getTranslations("adminContent.content.statusActions");
    return { ok: true, message: t("featured") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- edição completa (ContentForm)
type SaveContext = { id?: string | null; creatorId?: string | null };

// Admin cria/edita qualquer conteúdo, inclusive regra de acesso, módulo e conclusão.
// Valida com o MESMO esquema do formulário (parseContentForm/contentFormSchema), como o portal
// da personalidade: capa só da própria origem, só provedores habilitados, ID de mídia extraído
// da URL, legendas same-origin/https e corpo com a forma do tipo. Os campos só do admin
// (access_level, required_module_id, completion_mode) também fazem parte desse esquema.
export async function saveContentAction(context: SaveContext, values: ContentFormValues): Promise<ActionResult & { id?: string }> {
  const ctx = z.object({ id: uuid.nullable().optional(), creatorId: uuid.nullable().optional() }).safeParse(context);
  if (!ctx.success) return fail("invalid_input");
  const parsed = parseContentForm(values);
  if (!parsed.ok) return fail(parsed.errors.required_module_id === "moduleRequired" ? "premium_requires_module" : "invalid_input");
  const v = parsed.data;
  const accessLevel = v.access_level ?? null;
  const requiredModule = accessLevel === "premium" ? (v.required_module_id ?? null) : null;

  // Receita estruturada (0027) não passa por este formulário (o corpo v1 seria recusado no banco):
  // nem criar, nem converter, nem editar a existente até o editor novo (fase 2).
  if (v.type === "recipe") return fail("recipe_editor_pending");

  try {
    const userId = await requireAdmin();
    const supabase = await createClient();
    if (ctx.data.id) {
      const { data: current } = await supabase.from("content").select("type").eq("id", ctx.data.id).maybeSingle();
      if (current?.type === "recipe") return fail("recipe_editor_pending");
    }
    const t = await getTranslations("adminContent.content.form");
    const fields = {
      title: v.title,
      summary: v.summary || null,
      pillar: v.pillar,
      type: v.type,
      source_locale: v.source_locale,
      cover_url: v.cover_url || null,
      duration_minutes: v.duration_minutes,
      difficulty: v.difficulty,
      tags: v.tags,
      has_captions: v.has_captions,
      disclaimer_kind: v.disclaimer_kind,
      media_license_kind: v.media_license_kind,
      media_license_ref: v.media_license_ref || null,
      media_credit: v.media_credit || null,
      access_level: accessLevel,
      required_module_id: requiredModule,
      completion_mode: v.completion_mode ?? null,
    };

    let contentId = ctx.data.id ?? null;
    if (contentId) {
      const update = ctx.data.creatorId ? { ...fields, creator_id: ctx.data.creatorId } : fields;
      const { error } = await supabase.from("content").update(update).eq("id", contentId);
      if (error) return fail(error);
    } else {
      if (!ctx.data.creatorId) return fail("invalid_input");
      // Tenta até 3 slugs em caso de colisão improvável.
      let inserted: string | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
        const { data, error } = await supabase
          .from("content")
          .insert({ ...fields, slug: slugWithSuffix(v.title), creator_id: ctx.data.creatorId, status: "draft", review_status: "none", created_by: userId })
          .select("id")
          .single();
        if (!error && data) inserted = data.id;
        else {
          lastError = error;
          if (error?.code !== "23505") break;
        }
      }
      if (!inserted) return fail(lastError ?? "generic");
      contentId = inserted;
    }

    const { error: bodyError } = await supabase.from("content_bodies").upsert(
      {
        content_id: contentId,
        body: v.body as never,
        media_provider: v.media.provider,
        media_ref: v.media.ref || null,
        captions_url: v.media.captions_url || null,
      },
      { onConflict: "content_id" },
    );
    if (bodyError) return fail(bodyError);

    revalidatePath("/admin/content");
    revalidatePath(`/admin/content/${contentId}`);
    return { ok: true, id: contentId, message: ctx.data.id ? t("updated") : t("created") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- padrões de conclusão por tipo
const typeSettingsSchema = z
  .array(
    z.object({
      type: z.enum(["video", "recipe", "workout", "guide", "article"]),
      default_completion_mode: z.enum(["manual", "auto"]),
      auto_threshold_pct: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(5);

export async function saveContentTypeSettingsAction(rows: z.infer<typeof typeSettingsSchema>): Promise<ActionResult> {
  const parsed = typeSettingsSchema.safeParse(rows);
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    for (const row of parsed.data) {
      const { error } = await supabase
        .from("content_type_settings")
        .update({ default_completion_mode: row.default_completion_mode, auto_threshold_pct: row.auto_threshold_pct })
        .eq("type", row.type);
      if (error) return fail(error);
    }
    revalidatePath("/admin/content/settings");
    const t = await getTranslations("adminContent.content.typeSettings");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- regra de revisão por tipo (P1)
// Só pela RPC auditada (o gatilho da 0027 recusa o update direto da coluna), com justificativa.
export async function setReviewRequiredAction(type: string, on: boolean, justification: string): Promise<ActionResult> {
  const parsed = z
    .object({ type: z.enum(["video", "recipe", "workout", "guide", "article"]), on: z.boolean(), justification: z.string().trim().min(5).max(500) })
    .safeParse({ type, on, justification });
  if (!parsed.success) return fail("invalid_input");
  // só receita tem "Enviar para revisão" no portal: ligar para outro tipo travaria o herói
  if (!reviewChangeAllowed(parsed.data.type, parsed.data.on)) return fail("review_flow_unavailable");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_review_required", { p_type: parsed.data.type, p_on: parsed.data.on, p_reason: parsed.data.justification });
    if (error) return fail(error);
    revalidatePath("/admin/content/settings");
    revalidatePath("/creator/recipes");
    const t = await getTranslations("recipes.admin");
    return { ok: true, message: t("changed") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- buscas (SearchPicker) ---
// Conteúdo por título; `publishedOnly` para itens de programa, destaques e vínculos. `creatorId` limita
// aos conteúdos de um herói (etapas do programa do herói, 0052).
export async function searchContentAction(q: string, publishedOnly = true, creatorId: string | null = null): Promise<PickResult> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80), publishedOnly: z.boolean(), creatorId: z.uuid().nullable() }).safeParse({ q, publishedOnly, creatorId });
  if (!parsed.success) return { ok: true, items: [] };
  try {
    await requireAdmin();
    const supabase = await createClient();
    let query = supabase
      .from("content")
      .select("id, title, type, pillar, status, creator:creator_profiles(name)")
      .ilike("title", `%${escapeLike(parsed.data.q)}%`)
      .order("title")
      .limit(12);
    if (parsed.data.publishedOnly) query = query.eq("status", "published");
    if (parsed.data.creatorId) query = query.eq("creator_id", parsed.data.creatorId);
    const { data, error } = await query;
    if (error) return fail(error);
    const t = await getTranslations("adminContent.common.types");
    const ts = await getTranslations("adminCommon.status");
    const rows = (data ?? []) as unknown as { id: string; title: string; type: string; pillar: string; status: string; creator: { name: string } | null }[];
    return {
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: [t(r.type as never), r.creator?.name].filter(Boolean).join(" · "),
        badge: parsed.data.publishedOnly ? null : ts(r.status as never),
      })),
    };
  } catch (error) {
    return fail(error);
  }
}

// Programas pelo título da versão atual (ou de qualquer versão, se `anyVersion`).
export async function searchProgramsAction(q: string, publishedOnly = true): Promise<PickResult> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80), publishedOnly: z.boolean() }).safeParse({ q, publishedOnly });
  if (!parsed.success) return { ok: true, items: [] };
  try {
    await requireAdmin();
    const supabase = await createClient();
    let query = supabase
      .from("program_versions")
      .select("id, title, version_no, status, program:programs!program_versions_program_id_fkey(id, slug, status, current_version_id)")
      .ilike("title", `%${escapeLike(parsed.data.q)}%`)
      .order("title")
      .limit(20);
    if (parsed.data.publishedOnly) query = query.eq("status", "published");
    const { data, error } = await query;
    if (error) return fail(error);
    const ts = await getTranslations("adminCommon.status");
    const tv = await getTranslations("adminContent.common");
    const rows = (data ?? []) as unknown as { id: string; title: string; version_no: number; status: string; program: { id: string; slug: string; status: string; current_version_id: string | null } | null }[];
    // Um item por programa (a versão atual quando existir).
    const seen = new Set<string>();
    const items = rows
      .filter((r) => r.program && (!parsed.data.publishedOnly || r.program.status === "published"))
      .filter((r) => {
        const pid = r.program!.id;
        if (seen.has(pid)) return false;
        seen.add(pid);
        return true;
      })
      .map((r) => ({ id: r.program!.id, title: r.title, subtitle: `${r.program!.slug} · ${tv("version", { n: r.version_no })}`, badge: ts(r.program!.status as never) }));
    return { ok: true, items };
  } catch (error) {
    return fail(error);
  }
}

// Versões de programa (qualquer status) para a tela de traduções.
export async function searchProgramVersionsAction(q: string): Promise<PickResult> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80) }).safeParse({ q });
  if (!parsed.success) return { ok: true, items: [] };
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("program_versions")
      .select("id, title, version_no, status, program:programs!program_versions_program_id_fkey(slug)")
      .ilike("title", `%${escapeLike(parsed.data.q)}%`)
      .order("title")
      .limit(15);
    if (error) return fail(error);
    const ts = await getTranslations("adminCommon.status");
    const tv = await getTranslations("adminContent.common");
    const rows = (data ?? []) as unknown as { id: string; title: string; version_no: number; status: string; program: { slug: string } | null }[];
    return {
      ok: true,
      items: rows.map((r) => ({ id: r.id, title: r.title, subtitle: `${r.program?.slug ?? ""} · ${tv("version", { n: r.version_no })}`, badge: ts(r.status as never) })),
    };
  } catch (error) {
    return fail(error);
  }
}

// Produtos pelo título (qualquer status; o admin vê tudo).
export async function searchProductsAction(q: string): Promise<PickResult> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80) }).safeParse({ q });
  if (!parsed.success) return { ok: true, items: [] };
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, title, status, moderation_status, seller:seller_organizations(name)")
      .ilike("title", `%${escapeLike(parsed.data.q)}%`)
      .order("title")
      .limit(12);
    if (error) return fail(error);
    const ts = await getTranslations("adminCommon.status");
    const rows = (data ?? []) as unknown as { id: string; title: string; status: string; moderation_status: string; seller: { name: string } | null }[];
    return {
      ok: true,
      items: rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.seller?.name ?? null, badge: `${ts(r.status as never)} · ${ts(r.moderation_status as never)}` })),
    };
  } catch (error) {
    return fail(error);
  }
}
