import { Award, ChefHat } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

type ChefExtras = { specialties: string[]; credentials: string | null };

/**
 * Especialidades e credenciais APROVADAS do chef (P7). Consulta separada da do perfil: se o banco
 * ainda não tiver as colunas (antes da 0027), o perfil continua abrindo sem este bloco.
 */
export async function loadChefExtras(creatorId: string): Promise<ChefExtras> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("creator_profiles").select("specialties, credentials, credentials_approved_at").eq("id", creatorId).maybeSingle();
  if (error || !data) return { specialties: [], credentials: null };
  const row = data as { specialties: string[] | null; credentials: string | null; credentials_approved_at: string | null };
  const specialties = (row.specialties ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  // só o texto que o admin aprovou chega aqui; sem a data de aprovação, nada aparece
  const credentials = row.credentials_approved_at && row.credentials?.trim() ? row.credentials.trim() : null;
  return { specialties, credentials };
}

// Bloco do perfil público do chef: especialidades (etiquetas) e credenciais com o rótulo
// "Credenciais informadas pelo herói" (moderação do admin, não verificação).
export async function ChefHighlights({ creatorId }: { creatorId: string }) {
  const [{ specialties, credentials }, t, ts] = await Promise.all([loadChefExtras(creatorId), getTranslations("recipes.chefProfile"), getTranslations("recipes.structured")]);
  if (specialties.length === 0 && !credentials) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="chef-highlights">
      {specialties.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 type-caption font-semibold text-fg-muted">
            <ChefHat className="size-3.5" aria-hidden="true" />
            {t("specialties")}
          </span>
          <ul className="flex flex-wrap gap-1.5" aria-label={t("specialties")} data-testid="chef-specialties">
            {specialties.map((s) => (
              <li key={s} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {credentials ? (
        <p className="flex items-start gap-2 type-body-sm text-fg" data-testid="chef-credentials">
          <Award className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          <span>
            <span className="font-semibold">{ts("credentialsLabel")}: </span>
            {credentials}
          </span>
        </p>
      ) : null}
    </div>
  );
}
