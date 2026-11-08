import { z } from "zod";
import { MAX_CENTS, MEASURE_MAX, MEASURE_MIN, OFFER_MAX, OFFER_MIN, PERF_KINDS, validateCompensation, type CompensationDb } from "./model";

// Forma de pagamento (0140) no formato do banco, para as ações do servidor: confere a forma e as regras de
// compensation_valid antes de chamar a RPC (o banco confere de novo).

const cents = z.number().int().min(1).max(MAX_CENTS);

export const compensationDbSchema = z
  .strictObject({
    money: z.boolean(),
    barter: z.strictObject({ offer: z.string().trim().min(OFFER_MIN).max(OFFER_MAX), value_cents: cents.nullable() }).nullable(),
    performance: z
      .strictObject({
        kind: z.enum(PERF_KINDS),
        rate: z.number().positive(),
        measure: z.string().trim().min(MEASURE_MIN).max(MEASURE_MAX),
        estimate_cents: cents.nullable(),
      })
      .nullable(),
  })
  .superRefine((v, ctx) => {
    const error = validateCompensation({
      money: v.money,
      barter: v.barter ? { offer: v.barter.offer, valueCents: v.barter.value_cents } : null,
      performance: v.performance ? { kind: v.performance.kind, rate: v.performance.rate, measure: v.performance.measure, estimateCents: v.performance.estimate_cents } : null,
    });
    if (error) ctx.addIssue({ code: "custom", message: error });
  });

export type CompensationDbInput = z.infer<typeof compensationDbSchema> & CompensationDb;
