"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { talentFail } from "@/lib/talent/errors";
import { messageSchema } from "./schemas";

// Conversa do negócio (dois canais fechados: marca↔agência e creator↔agência). A mesma RPC serve aos
// três portais: o banco decide o lado de quem escreve e recusa quem não participa (D21).

export type DealActionResult = { ok: true; message: string; id?: string } | { ok: false; error: string };
export type DealPortal = "agency" | "brand" | "office";

const fail = (portal: DealPortal, error: unknown) => (portal === "office" ? talentFail(error) : agencyFail(error));

export async function postDealMessageAction(portal: DealPortal, input: { dealId: string; channel: "brand_agency" | "talent_agency"; talentId: string | null; body: string; revalidate: string }): Promise<DealActionResult> {
  await requireUser();
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(portal, "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("deal_message_post", { p_deal: d.dealId, p_channel: d.channel, p_talent: d.talentId, p_body: d.body });
    if (error) return fail(portal, error);
    // só caminhos dos três portais (nunca um caminho arbitrário vindo do cliente)
    if (/^\/(agencia\/negocios|marca\/campanhas|creator\/escritorio\/oportunidades)\/[0-9a-f-]{36}(\/conversa)?$/.test(input.revalidate)) revalidatePath(input.revalidate);
    const t = await getTranslations("commercial.messages");
    return { ok: true, message: t("sent"), id: data ?? undefined };
  } catch (error) {
    return fail(portal, error);
  }
}
