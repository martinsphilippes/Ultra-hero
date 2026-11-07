import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/ui/back-link";
import { PageHeader } from "@/components/ui";
import { PersonalityTest } from "@/components/personality/PersonalityTest";
import { requireUser } from "@/lib/auth/session";
import { AXES, isPersonalityType } from "@/lib/personality/test";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("personality");
  return { title: t("title") };
}

// Teste de personalidade (0128): para quem trabalha na plataforma (agência, marca, Hero). Mostra o resultado salvo,
// com a pontuação de cada eixo, e o questionário para fazer (ou refazer).
export default async function PersonalityPage({ searchParams }: { searchParams: Promise<{ refazer?: string }> }) {
  const user = await requireUser("/teste-de-personalidade");
  const [t, supabase, sp] = await Promise.all([getTranslations("personality"), createClient(), searchParams]);
  const [{ data: allowed }, { data: result }] = await Promise.all([
    supabase.rpc("works_on_platform"),
    supabase.from("personality_results").select("type, scores").eq("user_id", user.id).maybeSingle(),
  ]);
  const type = result && isPersonalityType(result.type) ? result.type : null;
  const scores = (result?.scores ?? {}) as Record<string, number>;
  const showTest = allowed && (!type || sp.refazer === "1");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <BackLink href="/">{t("title")}</BackLink>
      <PageHeader title={t("title")} description={t("description")} />
      {!allowed ? <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("notAllowed")}</p> : null}
      {type ? (
        <section className="flex flex-col gap-4 rounded-2xl border-2 border-accent bg-surface p-4 sm:p-5" data-testid="personality-result">
          <div className="flex flex-col gap-1">
            <p className="type-caption font-mono uppercase tracking-widest text-accent-text">{t("resultType", { type })}</p>
            <h2 className="type-h2 text-fg">{t("resultTitle", { name: t(`types.${type}.name`) })}</h2>
            <p className="type-body text-fg-muted">{t(`types.${type}.body`)}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {AXES.map((axis) => {
              const pct = Math.max(0, Math.min(100, Number(scores[axis] ?? 50)));
              return (
                <li key={axis} className="flex flex-col gap-1">
                  <span className="text-sm text-fg">{t(`axes.${axis}`)}</span>
                  <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
                    <span>{axis[0]} {pct}%</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </span>
                    <span>{100 - pct}% {axis[1]}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {!showTest ? (
            <a href="/teste-de-personalidade?refazer=1" className="w-fit text-sm font-semibold text-accent-text underline">
              {t("again")}
            </a>
          ) : null}
        </section>
      ) : null}
      {showTest ? <PersonalityTest /> : null}
    </main>
  );
}
