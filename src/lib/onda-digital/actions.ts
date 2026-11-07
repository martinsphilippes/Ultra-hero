"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ONDA_PURPOSES, ONDA_STATUSES, ONDA_WHEN } from "./format";

// Onda Digital (0132): a marca pede a onda; a Groscove avança a etapa do pedido.

type Result = { ok: true } | { ok: false; error: string };

const requestSchema = z
  .object({
    brandId: z.uuid(),
    package: z.string().trim().max(40).optional(),
    purpose: z.enum(ONDA_PURPOSES),
    whenKind: z.enum(ONDA_WHEN),
    whenDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    subject: z.string().trim().min(2).max(1000),
    budgetCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
    profileIds: z.array(z.uuid()).max(60).optional(),
  })
  .refine((v) => v.whenKind !== "date" || Boolean(v.whenDate), { path: ["whenDate"] });

export async function createOndaRequestAction(input: z.input<typeof requestSchema>): Promise<Result> {
  await requireUser("/marca/onda-digital");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_request_create", {
    p_brand: d.brandId,
    p_data: {
      package: d.package ?? "",
      purpose: d.purpose,
      when_kind: d.whenKind,
      when_date: d.whenKind === "date" ? (d.whenDate ?? null) : null,
      subject: d.subject,
      budget_cents: d.budgetCents ?? null,
      profile_ids: d.profileIds ?? [],
    } as never,
  });
  if (error) return agencyFail(error);
  revalidatePath("/marca/onda-digital");
  revalidatePath("/agencia/onda-digital");
  return { ok: true };
}

export async function setOndaRequestStatusAction(input: { id: string; status: string }): Promise<Result> {
  await requireUser("/agencia/onda-digital");
  const parsed = z.object({ id: z.uuid(), status: z.enum(ONDA_STATUSES) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("onda_request_set_status", { p_request: parsed.data.id, p_status: parsed.data.status });
  if (error) return agencyFail(error);
  revalidatePath("/agencia/onda-digital");
  return { ok: true };
}
