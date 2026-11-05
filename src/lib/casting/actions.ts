"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";
import { parseCastInputs, type CastInputs } from "./parse";

// Montador de elenco (0096): lê os dados (cachê em R$ só para o Adm; o gestor recebe proporções) e usa o elenco.
// A RPC confere papel, agência e negócio; o servidor só valida a forma.

export type CastLoadResult = { ok: true; data: CastInputs } | { ok: false; error: string };
export type CastApplyResult = { ok: true; message: string } | { ok: false; error: string };

const loadSchema = z
  .object({ dealId: z.uuid().nullable(), callId: z.uuid().nullable() })
  .refine((v) => (v.dealId === null) !== (v.callId === null));

export async function loadCastInputsAction(input: z.input<typeof loadSchema>): Promise<CastLoadResult> {
  const ctx = await requireAgency("manager");
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_cast_inputs", { p_agency: ctx.agency.id, p_deal: parsed.data.dealId, p_call: parsed.data.callId });
    if (error) return agencyFail(error);
    const out = parseCastInputs(data);
    if (!out) return agencyFail("generic");
    return { ok: true, data: out };
  } catch (error) {
    return agencyFail(error);
  }
}

const applySchema = z.object({
  dealId: z.uuid(),
  items: z
    .array(z.object({ talentId: z.uuid(), feeCents: z.number().int().min(0).max(10_000_000_000).nullable() }))
    .min(1)
    .max(30),
});

/** Usa o elenco no negócio: sugere os Heros e, só o Adm, grava a repartição como cachês. */
export async function applyCastAction(input: z.input<typeof applySchema>): Promise<CastApplyResult> {
  await requireAgency("manager");
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const items = d.items.map((x) => (x.feeCents === null ? { talent_id: x.talentId } : { talent_id: x.talentId, fee_cents: x.feeCents }));
    const { error } = await supabase.rpc("agency_deal_cast_apply", { p_deal: d.dealId, p_items: items as never });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/negocios/${d.dealId}`, "layout");
    revalidatePath("/agencia/pipeline");
    const t = await getTranslations("valueModel.cast");
    return { ok: true, message: t("applied", { count: d.items.length }) };
  } catch (error) {
    return agencyFail(error);
  }
}
