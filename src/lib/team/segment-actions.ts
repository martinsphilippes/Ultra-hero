"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_LEVELS } from "./levels";
import { HERO_SEGMENTS, HERO_SEGMENTS_MAX } from "./segments";

const schema = z.object({
  segments: z.array(z.enum(HERO_SEGMENTS)).max(HERO_SEGMENTS_MAX),
  level: z.enum(MEMBER_LEVELS).nullable(),
});

type Result = { ok: true } | { ok: false; error: string };

/** O próprio Hero escolhe os segmentos e o nível (Portal do Hero › Minha página). */
export async function saveMySegmentsAction(input: { segments: string[]; level: string | null }): Promise<Result> {
  await requireUser("/heroi/pagina");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_segments");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("hero_set_segments", { p_segments: parsed.data.segments, p_level: parsed.data.level });
    if (error) return agencyFail(error);
    revalidatePath("/heroi/pagina");
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}

/** A agência (gestor+) marca os segmentos e o nível de um Hero do casting. */
export async function saveTalentSegmentsAction(input: { talentId: string; segments: string[]; level: string | null }): Promise<Result> {
  await requireUser("/agencia/casting");
  const parsed = schema.extend({ talentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_segments");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_set_segments", { p_talent: parsed.data.talentId, p_segments: parsed.data.segments, p_level: parsed.data.level });
    if (error) return agencyFail(error);
    revalidatePath(`/agencia/casting/${parsed.data.talentId}`);
    revalidatePath("/agencia/casting");
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Quem é da equipe de uma marca escolhe o próprio cargo e nível (0125). */
export async function saveBrandLevelAction(input: { level: string | null; jobTitle: string }): Promise<Result> {
  await requireUser("/marca/equipe");
  const parsed = z.object({ level: z.enum(MEMBER_LEVELS).nullable(), jobTitle: z.string().trim().max(80) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_member_set_level", { p_level: parsed.data.level, p_job_title: parsed.data.jobTitle || null });
    if (error) return agencyFail(error);
    revalidatePath("/marca/equipe");
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}
