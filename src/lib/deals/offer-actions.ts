"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireBrand } from "@/lib/brand-portal/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_HEROES_LIMIT, validateTerms } from "@/lib/value-model/model";

// Proposta da marca no negócio (0106): a agência (só Adm) aceita ou contrapropõe; a marca (só o dono) aceita,
// contrapropõe ou recusa a contraproposta. As RPCs conferem papel, vez e etapa de novo; aqui só a forma.

export type OfferResult = { ok: true; message: string; status: string } | { ok: false; error: string };

const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const schema = z.object({
  dealId: z.uuid(),
  requestId: z.uuid().nullable(),
  action: z.enum(["accept", "counter", "decline"]),
  amountCents: z.number().int().min(1).max(10_000_000_000).nullable(),
  valueModel: z.enum(["fixo", "por_heroi"]),
  maxHeroes: z.number().int().min(1).max(MAX_HEROES_LIMIT).nullable(),
  periodStart: day,
  periodEnd: day,
  note: z.string().trim().max(500),
});
type Input = z.input<typeof schema>;

function refresh(dealId: string, requestId: string | null) {
  revalidatePath(`/agencia/negocios/${dealId}`, "layout");
  revalidatePath("/agencia/pipeline");
  if (requestId) revalidatePath(`/marca/campanhas/${requestId}`);
  revalidatePath("/marca/campanhas");
}

async function run(side: "agency" | "brand", input: Input): Promise<OfferResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (side === "agency" && d.action === "decline") return agencyFail("invalid_input");
  if (d.action === "counter") {
    const problem = validateTerms({ model: d.valueModel, amountCents: d.amountCents, maxHeroes: d.valueModel === "por_heroi" ? d.maxHeroes : null }, { requireAmount: true });
    if (problem) return agencyFail(problem);
    if (d.periodEnd && (!d.periodStart || d.periodEnd < d.periodStart)) return agencyFail("invalid_input");
  }
  const counter = d.action === "counter";
  const args = {
    p_deal: d.dealId,
    p_action: d.action,
    p_amount_cents: counter ? d.amountCents : null,
    p_value_model: counter ? d.valueModel : null,
    p_max_heroes: counter && d.valueModel === "por_heroi" ? d.maxHeroes : null,
    p_period_start: counter && d.periodStart ? d.periodStart : null,
    p_period_end: counter && d.periodStart ? d.periodEnd || d.periodStart : null,
    p_note: d.note || null,
  };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(side === "agency" ? "agency_deal_offer_reply" : "brand_deal_offer_reply", args);
    if (error) return agencyFail(error);
    refresh(d.dealId, d.requestId);
    const status = String(data ?? "");
    const t = await getTranslations("dealOffer.done");
    return { ok: true, status, message: t(status === "agreed" ? "agreed" : status === "declined" ? "declined" : "countered") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Agência (Adm): aceitar os termos atuais da marca ou contrapropor. */
export async function agencyOfferReplyAction(input: Input): Promise<OfferResult> {
  await requireAgency("admin");
  return run("agency", input);
}

/** Marca (dono): aceitar, contrapropor ou recusar a contraproposta da agência. */
export async function brandOfferReplyAction(input: Input): Promise<OfferResult> {
  const ctx = await requireBrand();
  if (ctx.role !== "owner") return agencyFail("forbidden");
  return run("brand", input);
}
