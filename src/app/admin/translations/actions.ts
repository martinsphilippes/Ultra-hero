"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { programConceptSchema } from "@/lib/programs/concept";
import { createClient } from "@/lib/supabase/server";

// Traduções manuais (content_localizations / program_localizations). Nunca traduz automaticamente.

const fail = failWith;
const uuid = z.uuid();
const locale = z.enum(["pt-BR", "en", "es"]);

async function requireAdmin(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
  return user.id;
}

// Corpo traduzido: objeto JSON (string vazia = sem corpo traduzido).
function parseBody(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

const contentLoc = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(600),
  body: z.string().max(200_000),
  status: z.enum(["draft", "published"]),
});

export async function saveContentLocalizationAction(contentId: string, targetLocale: string, input: z.infer<typeof contentLoc>): Promise<ActionResult> {
  const ids = z.object({ contentId: uuid, targetLocale: locale }).safeParse({ contentId, targetLocale });
  const parsed = contentLoc.safeParse(input);
  if (!ids.success || !parsed.success) return fail("invalid_input");
  try {
    const userId = await requireAdmin();
    let body: Record<string, unknown> | null;
    try {
      body = parseBody(parsed.data.body);
    } catch {
      return fail("invalid_json");
    }
    const supabase = await createClient();
    const row = {
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      body: body as never,
      status: parsed.data.status,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    // Upsert (on conflict … set body = excluded.body) exigiria ler a coluna body, que desde a 0027 não
    // tem grant de select: atualiza a linha existente ou insere uma nova (nenhum dos dois lê body).
    const { data: current, error: findError } = await supabase
      .from("content_localizations")
      .select("locale")
      .eq("content_id", ids.data.contentId)
      .eq("locale", ids.data.targetLocale)
      .maybeSingle();
    if (findError) return fail(findError);
    const { error } = current
      ? await supabase.from("content_localizations").update(row).eq("content_id", ids.data.contentId).eq("locale", ids.data.targetLocale)
      : await supabase.from("content_localizations").insert({ content_id: ids.data.contentId, locale: ids.data.targetLocale, ...row });
    if (error) return fail(error);
    revalidatePath("/admin/translations");
    const t = await getTranslations("adminContent.translations");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

const programLoc = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(600),
  description: z.string().trim().max(4000),
  status: z.enum(["draft", "published"]),
  // ausente = banco sem a 0048 (não mexe na coluna); null remove o conceito traduzido
  concept: programConceptSchema.nullable().optional(),
});

export async function saveProgramLocalizationAction(versionId: string, targetLocale: string, input: z.input<typeof programLoc>): Promise<ActionResult> {
  const ids = z.object({ versionId: uuid, targetLocale: locale }).safeParse({ versionId, targetLocale });
  const parsed = programLoc.safeParse(input);
  if (!ids.success || !parsed.success) return fail("invalid_input");
  try {
    const userId = await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("program_localizations").upsert(
      {
        version_id: ids.data.versionId,
        locale: ids.data.targetLocale,
        title: parsed.data.title,
        summary: parsed.data.summary || null,
        description: parsed.data.description || null,
        ...(parsed.data.concept !== undefined ? { concept: parsed.data.concept } : {}),
        status: parsed.data.status,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "version_id,locale" },
    );
    if (error) return fail(error);
    revalidatePath("/admin/translations");
    const t = await getTranslations("adminContent.translations");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}
