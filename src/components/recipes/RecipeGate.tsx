import { BookOpen, Clock, Home } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { recipeStepHref, RECIPE_STEPS } from "@/lib/recipes/onboarding";

type Props = {
  /** Para onde voltar depois de concluir a etapa. */
  nextPath: string;
};

// Bloqueio das receitas até concluir a etapa demonstrativa (vale para todos e para o app inteiro).
// Visitante segue para o login e volta para a etapa; quem está logado vai direto para a etapa.
// O título da página (biblioteca "Receitas" ou a própria receita) já vem do cabeçalho de quem usa.
export async function RecipeGate({ nextPath }: Props) {
  const t = await getTranslations("recipes.gate");

  return (
    <section aria-labelledby="recipe-gate-title" className="flex flex-col gap-5" data-testid="recipe-gate">
      <p className="rounded-full bg-fg py-2.5 text-center text-sm font-semibold uppercase tracking-[0.16em] text-bg">{t("brand")}</p>

      <p className="type-body-sm text-fg-muted">{t("description")}</p>

      <div className="flex flex-col gap-4 rounded-2xl bg-obsidian p-5 text-white shadow-sm">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <BookOpen className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="w-fit rounded-full bg-accent px-3 py-1 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-obsidian">
              {t("badge", { total: RECIPE_STEPS.length })}
            </span>
            <span className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-white/60">{t("eyebrow")}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="recipe-gate-title" className="text-lg font-semibold">
            {t("cardTitle")}
          </h2>
          <p className="text-sm text-white/75">{t("cardDescription")}</p>
        </div>
        <ol className="grid grid-cols-4 gap-2" aria-label={t("stepsLabel", { total: RECIPE_STEPS.length })}>
          {RECIPE_STEPS.map((step) => (
            <li key={step} className="h-1 rounded-full bg-accent">
              <span className="sr-only">{t(`steps.${step}`)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href={recipeStepHref(nextPath)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-obsidian px-4 text-sm font-semibold text-white hover:bg-obsidian/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          data-testid="recipe-gate-start"
        >
          <Clock className="size-4 text-accent" aria-hidden="true" />
          {t("start")}
        </Link>
        <Link
          href="/profile"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Home className="size-4" aria-hidden="true" />
          {t("backToToday")}
        </Link>
      </div>
    </section>
  );
}
