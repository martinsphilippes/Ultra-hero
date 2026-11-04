"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { accessEmailSchema, accessErrorCode, accessPhoneSchema, contactNameSchema, parseAccessProvision, type AccessKind } from "@/lib/agency/access-contact";
import { deliverAccess, type AccessOutcome } from "@/lib/agency/access-deliver";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";

// Acesso de quem a agência cadastra (0112): herói (talento do Casting) e contato da marca. Gestor+; as RPCs conferem
// de novo (agência do alvo, demo, e-mail/celular). O link aparece na tela quando o e-mail não sai.

export type { AccessOutcome };
export type AccessActionResult = ({ ok: true } & AccessOutcome) | { ok: false; error: string };

const kindSchema = z.enum(["talent", "brand"]);

async function targetName(supabase: Awaited<ReturnType<typeof createClient>>, kind: AccessKind, id: string): Promise<string> {
  if (kind === "talent") {
    const { data } = await supabase.from("talent_profiles").select("display_name").eq("id", id).maybeSingle();
    return data?.display_name ?? "";
  }
  const { data } = await supabase.from("brands").select("name").eq("id", id).maybeSingle();
  return data?.name ?? "";
}

function revalidateAccess(kind: AccessKind, id: string) {
  if (kind === "talent") {
    revalidatePath("/agencia/casting");
    revalidatePath(`/agencia/casting/${id}`, "layout");
    revalidatePath("/agencia/herois");
  } else {
    revalidatePath("/agencia/marcas");
    revalidatePath(`/agencia/marcas/${id}`);
  }
}

const contactSchema = z.object({ kind: kindSchema, targetId: z.uuid(), email: accessEmailSchema, phone: accessPhoneSchema, name: z.string().optional() });

/** Cadastrar/corrigir o contato (alvo antigo sem contato, ou e-mail errado enquanto o convite aguarda). */
export async function saveAccessContactAction(input: z.input<typeof contactSchema>): Promise<AccessActionResult> {
  const ctx = await requireAgency("manager");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return agencyFail(accessErrorCode(parsed.error));
  let name: string | null = null;
  if (parsed.data.kind === "brand" && parsed.data.name !== undefined) {
    const n = contactNameSchema.safeParse(parsed.data.name);
    if (!n.success) return agencyFail("name_required");
    name = n.data;
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("access_contact_save", { p_kind: parsed.data.kind, p_target: parsed.data.targetId, p_email: parsed.data.email, p_phone: parsed.data.phone, p_name: name });
    if (error) return agencyFail(error);
    const result = parseAccessProvision(data);
    if (!result) return agencyFail("generic");
    revalidateAccess(parsed.data.kind, parsed.data.targetId);
    const outcome = await deliverAccess({ kind: parsed.data.kind, result, email: parsed.data.email, name: await targetName(supabase, parsed.data.kind, parsed.data.targetId), agencyName: ctx.agency.name });
    return { ok: true, ...outcome };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Reenviar o convite (link novo; o anterior deixa de valer). Se o e-mail ganhou conta, liga na hora. */
export async function resendAccessInviteAction(input: { kind: AccessKind; targetId: string }): Promise<AccessActionResult> {
  const ctx = await requireAgency("manager");
  const parsed = z.object({ kind: kindSchema, targetId: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("access_invite_resend", { p_kind: parsed.data.kind, p_target: parsed.data.targetId });
    if (error) return agencyFail(error);
    const result = parseAccessProvision(data);
    if (!result) return agencyFail("generic");
    const { data: contact } = await supabase
      .from("access_contacts")
      .select("email")
      .eq(parsed.data.kind === "talent" ? "talent_id" : "brand_id", parsed.data.targetId)
      .maybeSingle();
    revalidateAccess(parsed.data.kind, parsed.data.targetId);
    const outcome = await deliverAccess({ kind: parsed.data.kind, result, email: contact?.email ?? "", name: await targetName(supabase, parsed.data.kind, parsed.data.targetId), agencyName: ctx.agency.name });
    return { ok: true, ...outcome };
  } catch (error) {
    return agencyFail(error);
  }
}
