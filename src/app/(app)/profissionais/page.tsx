import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Stethoscope } from "lucide-react";
import { ProfessionalCard } from "@/components/professionals/ProfessionalBits";
import { EmptyState, PageHeader } from "@/components/ui";
import { listPublicProfessionals } from "@/lib/professionals/queries";
import { isSpecialty, SPECIALTIES, type Specialty } from "@/lib/professionals/rules";
import { cn } from "@/lib/utils";

// Lista pública de profissionais (0058): só aprovados, filtro por especialidade (?especialidade=).
// No app das lojas também aparece (perfil sem "Contratar").
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("professionals.meta");
  return { title: t("list") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProfessionalsPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.especialidade) ? params.especialidade[0] : params.especialidade;
  const specialty: Specialty | null = isSpecialty(raw) ? raw : null;
  const [t, list] = await Promise.all([getTranslations("professionals"), listPublicProfessionals(specialty)]);
  const filters: (Specialty | null)[] = [null, ...SPECIALTIES.filter((s) => s === "nutritionist" || s === "personal_trainer" || s === specialty)];

  return (
    <div className="flex flex-col gap-5" data-testid="professionals-page">
      <PageHeader title={t("list.title")} description={t("list.description")} />
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Stethoscope />} title={t("list.unavailable")} />
        </div>
      ) : (
        <>
          <nav aria-label={t("list.filterLabel")}>
            <ul className="flex flex-wrap gap-2">
              {filters.map((key) => {
                const active = key === specialty;
                return (
                  <li key={key ?? "all"}>
                    {/* <a> comum: o roteador às vezes abortava a troca só de parâmetros na mesma página */}
                    <a
                      href={key ? `/profissionais?especialidade=${key}` : "/profissionais"}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                        active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg hover:bg-surface-hover",
                      )}
                    >
                      {t(`specialtyPlural.${key ?? "all"}`)}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          {list.items.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface">
              <EmptyState icon={<Stethoscope />} title={t("list.empty")} />
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((pro) => (
                <li key={pro.id}>
                  <ProfessionalCard pro={pro} href={`/profissionais/${pro.slug}`} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
