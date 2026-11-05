"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { defaultTimeZone } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { heroEventRange, toggleChecklist, toChecklist } from "./agenda";
import { heroWorkFail } from "./errors";
import { heroEventSchema, heroServiceSchema, isProofPath, PROOF_MIME_TYPES, type HeroEventInput, type HeroServiceInput } from "./vocab";

// Ações da agenda e do financeiro do Hero independente (0094). Escrita direta nas tabelas, sob RLS: só o titular (Hero
// não suspenso) grava; o banco confere de novo e o resultado vazio de um update/delete vira "sem permissão". Registro
// simulado: nada aqui movimenta dinheiro. Fuso fixo: o padrão do app (o Hero independente não tem agência).

export type HeroWorkResult = { ok: true; message: string; id?: string; url?: string; checklist?: { text: string; done: boolean }[] } | { ok: false; error: string };

const PATHS = ["/heroi/agenda", "/heroi/financeiro", "/profile"] as const;
function refresh() {
  for (const path of PATHS) revalidatePath(path);
}

export async function saveHeroEventAction(input: HeroEventInput): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = heroEventSchema.safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  const d = parsed.data;
  const range = heroEventRange(d, defaultTimeZone);
  if (!range) return heroWorkFail("invalid_input");
  const row = {
    kind: d.kind,
    title: d.title,
    starts_at: range.startsAt,
    ends_at: range.endsAt,
    all_day: d.allDay,
    location: d.location,
    notes: d.notes,
    client: d.client,
    service_id: d.serviceId || null,
    checklist: d.checklist,
  };
  try {
    const supabase = await createClient();
    let id = d.id ?? undefined;
    if (d.id) {
      const { data, error } = await supabase.from("hero_events").update(row).eq("id", d.id).eq("creator_profile_id", d.creatorId).select("id");
      if (error) return heroWorkFail(error);
      if (!data || data.length === 0) return heroWorkFail("forbidden");
    } else {
      const { data, error } = await supabase.from("hero_events").insert({ ...row, creator_profile_id: d.creatorId }).select("id").single();
      if (error) return heroWorkFail(error);
      id = data.id;
    }
    refresh();
    const t = await getTranslations("heroWork.agenda");
    return { ok: true, message: d.id ? t("saved") : t("created"), id };
  } catch (error) {
    return heroWorkFail(error);
  }
}

export async function deleteHeroEventAction(input: { id: string }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("hero_events").delete().eq("id", parsed.data.id).select("id");
    if (error) return heroWorkFail(error);
    if (!data || data.length === 0) return heroWorkFail("forbidden");
    refresh();
    const t = await getTranslations("heroWork.agenda");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return heroWorkFail(error);
  }
}

/** Marca/desmarca um item do checklist (o titular executa a lista no dia). Lê o atual e grava o invertido. */
export async function toggleChecklistAction(input: { id: string; index: number }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), index: z.number().int().min(0).max(29) }).safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data: row, error: readError } = await supabase.from("hero_events").select("checklist").eq("id", parsed.data.id).maybeSingle();
    if (readError) return heroWorkFail(readError);
    if (!row) return heroWorkFail("not_found");
    const next = toggleChecklist(toChecklist(row.checklist), parsed.data.index);
    const { data, error } = await supabase.from("hero_events").update({ checklist: next }).eq("id", parsed.data.id).select("id");
    if (error) return heroWorkFail(error);
    if (!data || data.length === 0) return heroWorkFail("forbidden");
    refresh();
    return { ok: true, message: "", checklist: next };
  } catch (error) {
    return heroWorkFail(error);
  }
}

function serviceRow(d: z.infer<typeof heroServiceSchema>) {
  const received = d.status === "received";
  return {
    title: d.title,
    client: d.client,
    service_on: d.serviceOn,
    amount_cents: d.amountCents,
    due_on: d.dueOn || null,
    status: d.status,
    // recebido sempre leva a data (o banco exige); os outros estados não guardam data de recebimento
    received_on: received ? d.receivedOn || null : null,
    payment_note: d.paymentNote,
  };
}

export async function saveHeroServiceAction(input: HeroServiceInput): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = heroServiceSchema.safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  const d = parsed.data;
  if (d.status === "received" && !d.receivedOn) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    let id = d.id ?? undefined;
    if (d.id) {
      const { data, error } = await supabase.from("hero_services").update(serviceRow(d)).eq("id", d.id).eq("creator_profile_id", d.creatorId).select("id");
      if (error) return heroWorkFail(error);
      if (!data || data.length === 0) return heroWorkFail("forbidden");
    } else {
      const { data, error } = await supabase.from("hero_services").insert({ ...serviceRow(d), creator_profile_id: d.creatorId }).select("id").single();
      if (error) return heroWorkFail(error);
      id = data.id;
    }
    refresh();
    const t = await getTranslations("heroWork.finance");
    return { ok: true, message: d.id ? t("saved") : t("created"), id };
  } catch (error) {
    return heroWorkFail(error);
  }
}

/** "Marcar como recebido": situação recebido com a data informada. */
export async function markServiceReceivedAction(input: { id: string; receivedOn: string }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("hero_services").update({ status: "received", received_on: parsed.data.receivedOn }).eq("id", parsed.data.id).neq("status", "cancelled").select("id");
    if (error) return heroWorkFail(error);
    if (!data || data.length === 0) return heroWorkFail("forbidden");
    refresh();
    const t = await getTranslations("heroWork.finance");
    return { ok: true, message: t("markedReceived") };
  } catch (error) {
    return heroWorkFail(error);
  }
}

/** Remove o serviço e, depois, o comprovante dele do armazenamento (o objeto some só se a linha saiu). */
export async function deleteHeroServiceAction(input: { id: string }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("hero_services").delete().eq("id", parsed.data.id).select("id, proof_path");
    if (error) return heroWorkFail(error);
    if (!data || data.length === 0) return heroWorkFail("forbidden");
    const path = data[0].proof_path;
    if (path) await supabase.storage.from("hero-proofs").remove([path]);
    refresh();
    const t = await getTranslations("heroWork.finance");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return heroWorkFail(error);
  }
}

/** Guarda o comprovante já enviado pelo navegador ao bucket privado hero-proofs; troca remove o arquivo anterior. */
export async function setServiceProofAction(input: { id: string; creatorId: string; path: string; mime: string }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), creatorId: z.uuid(), path: z.string().max(200), mime: z.enum(PROOF_MIME_TYPES) }).safeParse(input);
  if (!parsed.success || !isProofPath(parsed.data.path, parsed.data.creatorId, parsed.data.id)) return heroWorkFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase.from("hero_services").select("proof_path").eq("id", d.id).eq("creator_profile_id", d.creatorId).maybeSingle();
    if (readError) return heroWorkFail(readError);
    if (!current) return heroWorkFail("not_found");
    const { data, error } = await supabase.from("hero_services").update({ proof_path: d.path, proof_mime: d.mime }).eq("id", d.id).eq("creator_profile_id", d.creatorId).select("id");
    if (error) return heroWorkFail(error);
    if (!data || data.length === 0) return heroWorkFail("forbidden");
    if (current.proof_path && current.proof_path !== d.path) await supabase.storage.from("hero-proofs").remove([current.proof_path]);
    refresh();
    const t = await getTranslations("heroWork.finance");
    return { ok: true, message: t("proofSaved") };
  } catch (error) {
    return heroWorkFail(error);
  }
}

export async function removeServiceProofAction(input: { id: string }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data: current } = await supabase.from("hero_services").select("proof_path").eq("id", parsed.data.id).maybeSingle();
    if (!current) return heroWorkFail("not_found");
    const { data, error } = await supabase.from("hero_services").update({ proof_path: null, proof_mime: null }).eq("id", parsed.data.id).select("id");
    if (error) return heroWorkFail(error);
    if (!data || data.length === 0) return heroWorkFail("forbidden");
    if (current.proof_path) await supabase.storage.from("hero-proofs").remove([current.proof_path]);
    refresh();
    const t = await getTranslations("heroWork.finance");
    return { ok: true, message: t("proofRemoved") };
  } catch (error) {
    return heroWorkFail(error);
  }
}

/** Endereço assinado (60 s) do comprovante, gerado com o cliente do usuário: a RLS do bucket decide quem abre. */
export async function proofUrlAction(input: { id: string }): Promise<HeroWorkResult> {
  await requireUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return heroWorkFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data: row } = await supabase.from("hero_services").select("proof_path").eq("id", parsed.data.id).maybeSingle();
    if (!row?.proof_path) return heroWorkFail("not_found");
    const { data, error } = await supabase.storage.from("hero-proofs").createSignedUrl(row.proof_path, 60);
    if (error || !data?.signedUrl) return heroWorkFail("not_found");
    return { ok: true, message: "", url: data.signedUrl };
  } catch (error) {
    return heroWorkFail(error);
  }
}
