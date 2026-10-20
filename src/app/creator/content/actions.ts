"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseContentForm } from "@/components/editors/content/schema";
import type { ActionResult, ContentFormValues } from "@/components/editors/types";
import { getUser } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";
import { uniqueSlug } from "../_lib/slug";

// Ações da personalidade sobre conteúdo. A personalidade só grava rascunhos próprios;
// regra de acesso/publicação são do admin (RLS + guards de coluna no banco).

type SaveResult = ActionResult & { id?: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

// Colunas que a personalidade pode escrever (espelha trg_a_content_guard).
function creatorColumns(v: ContentFormValues) {
  return {
    title: v.title,
    summary: v.summary || null,
    cover_url: v.cover_url || null,
    duration_minutes: v.duration_minutes,
    difficulty: v.difficulty,
    tags: v.tags,
    has_captions: v.has_captions,
    pillar: v.pillar,
    type: v.type,
    source_locale: v.source_locale,
    disclaimer_kind: v.disclaimer_kind,
  };
}

async function saveBody(supabase: Supabase, contentId: string, v: ContentFormValues): Promise<string | null> {
  const { error } = await supabase.from("content_bodies").upsert(
    {
      content_id: contentId,
      body: v.body as unknown as NonNullable<Json>,
      media_provider: v.media.provider,
      media_ref: v.media.ref,
      captions_url: v.media.captions_url,
    },
    { onConflict: "content_id" },
  );
  return error ? failFrom(error).error : null;
}

function revalidateContent(id?: string) {
  revalidatePath("/creator");
  revalidatePath("/creator/content");
  revalidatePath("/creator/links");
  if (id) revalidatePath(`/creator/content/${id}/edit`);
}

export async function createContent(values: ContentFormValues): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const parsed = parseContentForm(values);
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: creatorId } = await supabase.rpc("my_creator_id");
  if (!creatorId) return { ok: false, error: "creator_unavailable" };

  // Slug único: em colisão (23505) tenta outro sufixo.
  let contentId: string | null = null;
  let lastError: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 3 && !contentId; attempt++) {
    const { data, error } = await supabase
      .from("content")
      .insert({ slug: uniqueSlug(v.title), creator_id: creatorId, created_by: user.id, ...creatorColumns(v) })
      .select("id")
      .single();
    if (data) contentId = data.id;
    else {
      lastError = error;
      if (error?.code !== "23505") break;
    }
  }
  if (!contentId) return failFrom(lastError);

  const bodyError = await saveBody(supabase, contentId, v);
  revalidateContent(contentId);
  if (bodyError) return { ok: false, error: bodyError, id: contentId };
  return { ok: true, id: contentId };
}

export async function updateContent(values: ContentFormValues): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const parsed = parseContentForm(values);
  if (!parsed.ok || !parsed.data.id) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  const id = v.id as string;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("content").select("id, status, review_status").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };
  // Mesma regra do guard do banco; evita gravar o corpo de algo em revisão.
  if (existing.status !== "draft" || existing.review_status === "in_review") return { ok: false, error: "content_not_editable" };

  const { error } = await supabase.from("content").update(creatorColumns(v)).eq("id", id);
  if (error) return failFrom(error);

  const bodyError = await saveBody(supabase, id, v);
  revalidateContent(id);
  if (bodyError) return { ok: false, error: bodyError, id };
  return { ok: true, id };
}

export async function submitForReview(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_content_for_review", { p_content: parsed.data.id });
  if (error) return failFrom(error);
  revalidateContent(parsed.data.id);
  return { ok: true };
}
