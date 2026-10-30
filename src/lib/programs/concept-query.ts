import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import { pickConcept, type ProgramConcept } from "./concept";

type Client = Awaited<ReturnType<typeof createClient>>;

// Conceito em consulta própria: num banco sem a 0048 a coluna não existe e o select dá erro; aqui o
// erro vira "sem conceito" e a página segue com a descrição (nunca derruba o resto da tela).
export async function loadProgramConcept(supabase: Client, versionId: string, locale: Locale): Promise<ProgramConcept | null> {
  try {
    const [versionRes, locRes] = await Promise.all([
      supabase.from("program_versions").select("concept").eq("id", versionId).maybeSingle(),
      supabase.from("program_localizations").select("concept").eq("version_id", versionId).eq("locale", locale).eq("status", "published").maybeSingle(),
    ]);
    const versionConcept = versionRes.error ? null : (versionRes.data?.concept ?? null);
    const localizedConcept = locRes.error ? null : (locRes.data?.concept ?? null);
    return pickConcept(versionConcept, localizedConcept);
  } catch {
    return null;
  }
}

/** Banco já tem a coluna concept? (admin esconde o editor de conceito antes da 0048). */
export async function conceptColumnSupported(supabase: Client): Promise<boolean> {
  try {
    const { error } = await supabase.from("program_versions").select("concept").limit(0);
    return !error;
  } catch {
    return false;
  }
}
