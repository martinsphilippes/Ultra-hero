"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/editors/types";
import { CREDENTIALS_MAX_LENGTH, SPECIALTIES_MAX, SPECIALTY_MAX_LENGTH } from "@/lib/recipes/credentials";
import { failFrom } from "../_lib/action-utils";
import { creatorActionContext } from "../_lib/creator-action";

// Perfil de chef do herói: especialidades (coluna liberada pela guarda) e o pedido de credenciais
// (P7). O pedido fica em creator_credentials_requests (só dono e admin leem); o texto só chega ao
// perfil público quando o admin aprova, e editar ou retirar o pedido tira o aprovado do perfil.

// O perfil do herói mora no /profile (topo, editor "Editar perfil").
function revalidateProfile() {
  revalidatePath("/profile");
  revalidatePath("/admin/creators");
  revalidatePath("/personalities");
}

export async function saveSpecialties(input: { specialties: string[] }): Promise<ActionResult> {
  const parsed = z.object({ specialties: z.array(z.string().trim().min(1).max(SPECIALTY_MAX_LENGTH)).max(SPECIALTIES_MAX) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const specialties = Array.from(new Set(parsed.data.specialties));
  const { error } = await ctx.supabase.from("creator_profiles").update({ specialties }).eq("id", ctx.creatorId);
  if (error) return failFrom(error);
  revalidateProfile();
  return { ok: true };
}

/** Envia ou edita o pedido (select + update/insert: o grant de update não cobre creator_id, então sem upsert). */
export async function requestCredentials(input: { text: string }): Promise<ActionResult> {
  const parsed = z.object({ text: z.string().trim().min(1).max(CREDENTIALS_MAX_LENGTH) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { data: existing, error: readError } = await ctx.supabase.from("creator_credentials_requests").select("creator_id").eq("creator_id", ctx.creatorId).maybeSingle();
  if (readError) return failFrom(readError);
  const { error } = existing
    ? await ctx.supabase.from("creator_credentials_requests").update({ text: parsed.data.text }).eq("creator_id", ctx.creatorId)
    : await ctx.supabase.from("creator_credentials_requests").insert({ creator_id: ctx.creatorId, text: parsed.data.text });
  if (error) return failFrom(error);
  revalidateProfile();
  return { ok: true };
}

export async function withdrawCredentials(): Promise<ActionResult> {
  const ctx = await creatorActionContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.from("creator_credentials_requests").delete().eq("creator_id", ctx.creatorId);
  if (error) return failFrom(error);
  revalidateProfile();
  return { ok: true };
}
