import { Clock, CookingPot, Hourglass, Lightbulb, ShieldCheck, Thermometer, Timer, Users, UtensilsCrossed, VideoOff, Wheat } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import { VideoEmbed } from "@/components/player";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatNumber, formatPlainDate } from "@/i18n/format";
import { RECIPE_UNITS, type RecipeUnit } from "@/lib/recipes/codes";
import { buildRecipeViewModel, formatStepDuration, type RecipeViewModel, type UnitLabels } from "@/lib/recipes/view-model";
import type { RecipeRows } from "@/lib/recipes/rows";
import type { ResolvedVideo } from "@/lib/video/types";
import { RecipeGallery } from "./RecipeGallery";
import { RecipeIngredientList } from "./RecipeIngredientList";

const NUTRIENTS = [
  { key: "kcal", unit: "kcal" },
  { key: "protein_g", unit: "g" },
  { key: "carbs_g", unit: "g" },
  { key: "fat_g", unit: "g" },
  { key: "fiber_g", unit: "g" },
  { key: "sodium_mg", unit: "mg" },
] as const;

/** Rótulos das unidades no idioma da tela (singular/plural), de recipes.structured.units. */
export async function loadUnitLabels(): Promise<UnitLabels> {
  const t = await getTranslations("recipes.structured.units");
  return Object.fromEntries(RECIPE_UNITS.map((u) => [u, [t(`${u}.one`), t(`${u}.other`)] as const])) as Record<RecipeUnit, readonly [string, string]>;
}

export async function buildViewModel(rows: RecipeRows, title: string): Promise<RecipeViewModel> {
  const [labels, locale] = await Promise.all([loadUnitLabels(), getLocale()]);
  return buildRecipeViewModel(rows, { labels, title, locale });
}

type Header = {
  title: string;
  summary: string | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  creator: { slug: string; name: string; avatar_url: string | null; is_fictional: boolean } | null;
};

type Props = {
  model: RecipeViewModel;
  /** Pré-visualização mostra também título, descrição e assinatura (a página pública já tem o cabeçalho). */
  header?: Header;
  video: ResolvedVideo | null;
  /** Foto de rascunho/agendada: o otimizador do Next busca sem a sessão, então vai direto ao proxy. */
  unoptimizedImages: boolean;
  categoryLabels?: Record<string, string>;
};

// Renderizador da receita estruturada (0027): galeria, história, tempos e rendimento, ingredientes
// com observação/opcional/substituições, etapas com duração, temperatura, foto e dica, alérgenos
// declarados ou "não informados", nutrição só validada (com origem) e o vídeo. Usado pela página
// pública /content/[slug] e pela prévia do chef, com o mesmo modelo de dados.
export async function RecipeView({ model, header, video, unoptimizedImages, categoryLabels }: Props) {
  const [t, ts, ta, td, tcat, tsrc, locale] = await Promise.all([
    getTranslations("recipes.view"),
    getTranslations("recipes.structured"),
    getTranslations("recipes.onboarding.allergies"),
    getTranslations("recipes.onboarding.restrictions"),
    getTranslations("catalog"),
    getTranslations("recipes.editor.extras.sources"),
    getLocale(),
  ]);
  const uiLocale = locale as Locale;
  const durationText = (seconds: number) => {
    const { h, m, s } = formatStepDuration(seconds);
    if (h > 0) return t("durationHour", { h, m });
    if (m > 0 && s > 0) return t("durationMinSec", { m, s });
    if (m > 0) return t("durationMin", { m });
    return t("durationSec", { s });
  };
  const facts = [
    model.totalMinutes !== null ? { icon: <Clock />, text: t("total", { n: model.totalMinutes }) } : null,
    model.prepMinutes ? { icon: <UtensilsCrossed />, text: t("prep", { n: model.prepMinutes }) } : null,
    model.cookMinutes ? { icon: <CookingPot />, text: t("cook", { n: model.cookMinutes }) } : null,
    model.restMinutes ? { icon: <Hourglass />, text: t("rest", { n: model.restMinutes }) } : null,
    model.servings !== null ? { icon: <Users />, text: t("servings", { n: model.servings }) } : null,
    model.yieldText ? { icon: null, text: t("yield", { text: model.yieldText }) } : null,
    header?.difficulty ? { icon: null, text: tcat(`difficulty.${header.difficulty}`) } : null,
  ].filter((f): f is { icon: ReactElement | null; text: string } => Boolean(f));

  return (
    <article className="flex flex-col gap-8" data-testid="recipe-view">
      {header && (
        <header className="flex flex-col gap-3">
          <h1 className="type-h1 text-balance text-fg">{header.title}</h1>
          {header.summary && <p className="type-body max-w-prose text-fg-muted">{header.summary}</p>}
          {header.creator && (
            <Link href={`/personalities/${header.creator.slug}`} className="flex w-fit min-h-11 items-center gap-3 rounded-xl pr-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <Avatar src={header.creator.avatar_url} name={header.creator.name} alt="" size="md" />
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                {tcat("by", { name: header.creator.name })}
                {header.creator.is_fictional && (
                  <Badge variant="demo" size="sm">
                    {tcat("fictional")}
                  </Badge>
                )}
              </span>
            </Link>
          )}
        </header>
      )}

      <RecipeGallery photos={model.photos} unoptimized={unoptimizedImages} />

      {model.story && (
        <section aria-labelledby="recipe-story" className="flex flex-col gap-2">
          <h2 id="recipe-story" className="type-h3 text-fg">
            {t("story")}
          </h2>
          <p className="type-body max-w-prose whitespace-pre-line text-fg-muted">{model.story}</p>
        </section>
      )}

      {(facts.length > 0 || model.categories.length > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label={t("facts")}>
          {facts.map((f) => (
            <li key={f.text}>
              <Badge variant="neutral" icon={f.icon ?? undefined}>
                {f.text}
              </Badge>
            </li>
          ))}
          {model.categories.map((c) => (
            <li key={c}>
              <Badge variant="accent">{categoryLabels?.[c] ?? (ts.has(`categories.${c}`) ? ts(`categories.${c}`) : c)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <RecipeIngredientList ingredients={model.ingredients} labels={{ title: t("ingredients"), optional: t("optional"), toTaste: t("toTaste"), substitutes: t("substitutes") }} />

        <section aria-labelledby="recipe-steps" className="flex flex-col gap-3">
          <h2 id="recipe-steps" className="type-h3 text-fg">
            {t("steps")}
          </h2>
          <ol className="flex flex-col gap-5" data-testid="recipe-steps">
            {model.steps.map((step) => (
              <li key={step.id} className="flex gap-3">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                  {step.number}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="type-body whitespace-pre-line text-fg">
                    <span className="sr-only">{t("step", { n: step.number })}: </span>
                    {step.instruction}
                  </p>
                  {(step.durationSeconds || step.temperatureC !== null) && (
                    <p className="flex flex-wrap gap-2">
                      {step.durationSeconds ? (
                        <Badge variant="neutral" size="sm" icon={<Timer />}>
                          {durationText(step.durationSeconds)}
                        </Badge>
                      ) : null}
                      {step.temperatureC !== null ? (
                        <Badge variant="neutral" size="sm" icon={<Thermometer />}>
                          {t("temperature", { c: step.temperatureC })}
                        </Badge>
                      ) : null}
                    </p>
                  )}
                  {step.ingredients.length > 0 && (
                    <p className="type-caption text-fg-muted">
                      <span className="font-semibold">{t("stepIngredients")}: </span>
                      {step.ingredients.join(", ")}
                    </p>
                  )}
                  {step.image && (
                    <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl border border-border">
                      <Image src={step.image.src} alt={step.image.alt} fill unoptimized sizes="(min-width: 768px) 28rem, 100vw" className="object-cover" />
                    </div>
                  )}
                  {step.tip && (
                    <p className="flex items-start gap-2 rounded-lg bg-surface-elevated px-3 py-2 type-body-sm text-fg">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
                      <span>
                        <span className="font-semibold">{t("tip")}: </span>
                        {step.tip}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="recipe-allergens" className="flex flex-col gap-2" data-testid="recipe-allergens">
        <h2 id="recipe-allergens" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Wheat className="size-4 text-warning" aria-hidden="true" />
          {t("allergens")}
        </h2>
        {!model.allergensDeclared ? (
          <p className="type-body-sm text-fg-muted">{ts("allergensNotInformed")}</p>
        ) : model.allergens.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("allergensNone")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("declaredByChef")}>
            {model.allergens.map((a) => (
              <li key={a}>
                <Badge variant="warning">{ta(a)}</Badge>
              </li>
            ))}
          </ul>
        )}
        {model.allergensDeclared && model.allergenNotes ? <p className="type-caption text-fg-muted">{model.allergenNotes}</p> : null}
        {model.allergensDeclared ? <p className="type-caption text-fg-subtle">{t("declaredByChef")}</p> : null}
        {model.diets.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2">
            <h3 className="text-sm font-semibold text-fg">{t("diets")}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {model.diets.map((d) => (
                <li key={d}>
                  <Badge variant="success">{td(d)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Números só com validação profissional (RB-08); sem ela, só o estado "informado pelo chef". */}
      {model.nutrition.state === "validated" && model.nutrition.values && (
        <section aria-labelledby="recipe-nutrition" className="flex flex-col gap-3">
          <h2 id="recipe-nutrition" className="type-h3 text-fg">
            {t("nutrition")}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 py-2 text-left type-caption text-fg-muted">{t("perServing")}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t("nutrient")}</th>
                  <th scope="col">{t("amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {NUTRIENTS.filter((n) => model.nutrition.values?.[n.key] !== null).map((n) => (
                  <tr key={n.key}>
                    <th scope="row" className="px-4 py-2 text-left font-medium text-fg">
                      {t(`nutrients.${n.key}`)}
                    </th>
                    <td className="type-numeric px-4 py-2 text-right text-fg">
                      {formatNumber(model.nutrition.values?.[n.key] as number, uiLocale, { maximumFractionDigits: 1 })} {n.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {model.nutrition.validatedBy && model.nutrition.validatedAt && (
            <p className="flex items-start gap-2 type-caption text-success">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("validatedBy", { by: model.nutrition.validatedBy, date: formatPlainDate(model.nutrition.validatedAt, uiLocale) })}
            </p>
          )}
          {model.nutrition.source && <p className="type-caption text-fg-muted">{t("source", { source: tsrc(model.nutrition.source) })}</p>}
          {model.nutrition.note && <p className="type-caption text-fg-muted">{model.nutrition.note}</p>}
          <p className="type-caption text-fg-muted">{t("nutritionDisclaimer")}</p>
        </section>
      )}
      {model.nutrition.state === "pending" && (
        <p role="note" className="rounded-xl border border-dashed border-border px-4 py-3 type-body-sm text-fg-muted">
          {ts("nutritionInformed")}
        </p>
      )}

      {video && (
        <section aria-labelledby="recipe-video" className="flex flex-col gap-3">
          <h2 id="recipe-video" className="type-h3 text-fg">
            {t("video")}
          </h2>
          {video.type === "iframe" ? (
            <VideoEmbed src={video.url} title={header?.title ?? t("video")} />
          ) : (
            <div className="rounded-2xl border border-border bg-surface">
              <EmptyState size="sm" icon={<VideoOff />} title={t("videoUnavailable")} description={t("videoProcessing")} />
            </div>
          )}
        </section>
      )}

      {model.chefNote && (
        <p className="rounded-xl border border-border bg-surface-elevated px-4 py-3 type-body-sm text-fg-muted">
          <span className="font-semibold text-fg">{t("chefNote")}: </span>
          {model.chefNote}
        </p>
      )}

      {model.ratingAvg !== null && <p className="type-caption text-fg-muted">{t("rating", { avg: model.ratingAvg, count: model.ratingCount })}</p>}
    </article>
  );
}
