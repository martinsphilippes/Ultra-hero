"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES } from "./constants";

// Documentos do módulo (bucket privado agency-docs, 3.4): o banco escolhe o caminho na reserva, o
// navegador envia o arquivo direto ao Storage (política: só a própria reserva pendente) e confirma.
// Leitura por URL assinada de 60 s com o cliente do usuário: a RLS de documents decide.

// Telas que mostram documentos (o cliente só escolhe entre estes caminhos; revisão de segurança da
// etapa B: revalidatePath com qualquer caminho vindo do navegador esvaziava o cache de outras rotas).
const REVALIDATE_PATHS = [/^\/agencia\/casting\/[0-9a-f-]{36}\/documentos$/];
const revalidateSchema = z.string().max(200).refine((p) => REVALIDATE_PATHS.some((re) => re.test(p)));

export type DocumentResult = { ok: true; message: string; id?: string; path?: string; url?: string } | { ok: false; error: string };

const reserveSchema = z.object({
  agencyId: z.uuid(),
  scopeType: z.enum(["agency", "brand", "talent"]),
  scopeId: z.uuid(),
  kind: z.enum(["contract", "report", "media", "other"]),
  title: z.string().trim().min(1).max(120),
  mimeType: z.enum(DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
  shareTalent: z.boolean().optional(),
  shareBrand: z.boolean().optional(),
  restricted: z.boolean().optional(),
  revalidate: revalidateSchema,
});

export async function reserveDocumentAction(input: z.input<typeof reserveSchema>): Promise<DocumentResult> {
  await requireUser();
  const parsed = reserveSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("document_reserve", {
      p_agency: d.agencyId,
      p_scope_type: d.scopeType,
      p_scope_id: d.scopeId,
      p_meta: {
        kind: d.kind,
        title: d.title,
        mime_type: d.mimeType,
        size_bytes: d.sizeBytes,
        share_talent: d.shareTalent ?? false,
        share_brand: d.shareBrand ?? false,
        restricted: d.restricted ?? false,
      },
    });
    if (error) return agencyFail(error);
    const row = data as { id?: string; path?: string } | null;
    if (!row?.id || !row.path) return agencyFail("generic");
    return { ok: true, message: "", id: row.id, path: row.path };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function confirmDocumentAction(input: { id: string; revalidate: string }): Promise<DocumentResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), revalidate: revalidateSchema }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("document_confirm", { p_id: parsed.data.id });
    if (error) return agencyFail(error);
    revalidatePath(parsed.data.revalidate);
    const t = await getTranslations("agency.documents");
    return { ok: true, message: t("uploaded"), id: parsed.data.id };
  } catch (error) {
    return agencyFail(error);
  }
}

/** URL assinada de 60 s, gerada com o cliente do usuário (quem não lê o documento recebe "não encontrado"). */
export async function signedUrlAction(input: { id: string }): Promise<DocumentResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", parsed.data.id).eq("status", "ready").maybeSingle();
    if (!doc) return agencyFail("not_found");
    const { data, error } = await supabase.storage.from("agency-docs").createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) return agencyFail("not_found");
    return { ok: true, message: "", url: data.signedUrl };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function archiveDocumentAction(input: { id: string; revalidate: string }): Promise<DocumentResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), revalidate: revalidateSchema }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("document_archive", { p_id: parsed.data.id, p_reason: null });
    if (error) return agencyFail(error);
    revalidatePath(parsed.data.revalidate);
    const t = await getTranslations("agency.documents");
    return { ok: true, message: t("archived") };
  } catch (error) {
    return agencyFail(error);
  }
}
