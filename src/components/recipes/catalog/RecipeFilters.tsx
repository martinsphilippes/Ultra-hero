import { Search, SlidersHorizontal, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ChipLink, ChipRow } from "@/components/discover/ChipLink";
import { Button, IconButton, Input } from "@/components/ui";
import {
  activeRecipeFilters,
  EMPTY_RECIPE_PARAMS,
  RECIPE_QUERY_MAX,
  RECIPE_TIME_LIMITS,
  recipeCatalogHref,
  withoutRecipeFilter,
  type ActiveRecipeFilter,
  type RecipeCatalogParams,
} from "@/lib/recipes/catalog-params";
import type { RecipeCategoryOption } from "@/lib/recipes/catalog";
import { RECIPE_ALLERGENS, RECIPE_CATALOG_SORTS, RECIPE_DIETS } from "@/lib/recipes/codes";
import { RECIPE_DIFFICULTIES } from "@/lib/recipes/payload";
import { GetForm } from "./GetForm";

type Common = {
  params: RecipeCatalogParams;
  /** Rota do catálogo ("/explore" ou a biblioteca do chef). */
  base: string;
  /** Parâmetros fixos da rota (tab=receitas no Explorar). */
  fixed: [string, string][];
  /** Prefixo dos ids (dois catálogos não se cruzam na mesma página). */
  idPrefix: string;
};

function Hidden({ entries }: { entries: [string, string][] }) {
  return (
    <>
      {entries.map(([name, value], index) => (
        <input key={`${name}-${value}-${index}`} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/** Campos do catálogo que um formulário não edita e precisa levar adiante. */
function carry(p: RecipeCatalogParams, skip: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  if (!skip.includes("q") && p.q) out.push(["q", p.q]);
  if (!skip.includes("cat") && p.cat) out.push(["cat", p.cat]);
  if (!skip.includes("tempo") && p.tempo) out.push(["tempo", String(p.tempo)]);
  if (!skip.includes("dif") && p.dif) out.push(["dif", p.dif]);
  if (!skip.includes("dieta")) for (const d of p.dieta) out.push(["dieta", d]);
  if (!skip.includes("sem")) for (const a of p.sem) out.push(["sem", a]);
  if (!skip.includes("ordem") && p.ordem !== "relevance") out.push(["ordem", p.ordem]);
  return out;
}

// Busca do catálogo por nome, chef ou ingrediente (GET: funciona sem JS e a URL é compartilhável).
export async function RecipeSearchForm({ params, base, fixed, idPrefix }: Common) {
  const t = await getTranslations("recipes.catalog.search");
  const inputId = `${idPrefix}-q`;
  return (
    <GetForm role="search" action={base} defaults={{ ordem: "relevance" }} className="flex flex-col gap-1.5" data-testid="recipe-search">
      <Hidden entries={[...fixed, ...carry(params, ["q"])]} />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            {t("label")}
          </label>
          <Input
            id={inputId}
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder={t("placeholder")}
            maxLength={RECIPE_QUERY_MAX}
            autoComplete="off"
            enterKeyHint="search"
            leadingIcon={<Search />}
            aria-describedby={`${inputId}-hint`}
          />
        </div>
        {params.q ? (
          <IconButton asChild label={t("clear")} icon={<X />} variant="secondary">
            <a href={recipeCatalogHref(base, { ...params, q: "" }, fixed)} />
          </IconButton>
        ) : null}
        <Button type="submit" variant="primary">
          {t("submit")}
        </Button>
      </div>
      <p id={`${inputId}-hint`} className="type-caption text-fg-subtle">
        {t("hint")}
      </p>
    </GetForm>
  );
}

function Choice({ type, name, value, checked, children, id }: { type: "radio" | "checkbox"; name: string; value: string; checked: boolean; children: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="relative inline-flex cursor-pointer">
      <input id={id} type={type} name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg peer-checked:border-fg peer-checked:bg-fg peer-checked:text-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
        {children}
      </span>
    </label>
  );
}

function Group({ legend, hint, children }: { legend: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold text-fg">{legend}</legend>
      {hint ? <p className="type-caption text-fg-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

type FiltersProps = Common & { categories: RecipeCategoryOption[] };

// Filtros do catálogo: atalhos de tempo e categoria (links), painel "Filtros" recolhível com todos
// os campos (<details> + formulário GET: abre e envia sem JavaScript) e os filtros ativos como chips
// removíveis com "Limpar tudo". Dieta e alérgeno trazem "declarado pelo chef" e só valem quando a
// pessoa marca: nada vem pré-marcado da etapa demonstrativa (seção 2.6).
// Links e chips são <a> comuns (navegação de documento, como o GetForm): na biblioteca do chef o
// roteador do Next abortava a ida de /receitas para /receitas?tempo=15 e a tela não mudava.
export async function RecipeFilters({ params, base, fixed, idPrefix, categories }: FiltersProps) {
  const [t, tcat, ta, td, ts] = await Promise.all([
    getTranslations("recipes.catalog.filters"),
    getTranslations("catalog"),
    getTranslations("recipes.onboarding.allergies"),
    getTranslations("recipes.onboarding.restrictions"),
    getTranslations("recipes.catalog.filters.sorts"),
  ]);
  const active = activeRecipeFilters(params);
  const categoryLabel = (code: string) => categories.find((c) => c.code === code)?.label ?? code;
  const labelOf = (f: ActiveRecipeFilter): string => {
    switch (f.key) {
      case "cat":
        return categoryLabel(f.value);
      case "tempo":
        return t("timeUpTo", { n: Number(f.value) });
      case "dif":
        return tcat(`difficulty.${f.value}`);
      case "dieta":
        return `${td(f.value)} · ${t("declaredShort")}`;
      case "sem":
        return `${t("without", { allergen: ta(f.value) })} · ${t("declaredShort")}`;
    }
  };
  const href = (p: RecipeCatalogParams) => recipeCatalogHref(base, p, fixed);
  const panelCount = [params.dif, ...params.dieta, ...params.sem, params.ordem !== "relevance" ? params.ordem : null].filter(Boolean).length;
  const id = (name: string, value: string) => `${idPrefix}-${name}-${value || "any"}`;

  return (
    <div className="flex flex-col gap-3" data-testid="recipe-filters">
      <ChipRow label={t("quick")}>
        {RECIPE_TIME_LIMITS.map((n) => {
          const selected = params.tempo === n;
          return (
            <ChipLink key={n} document href={href({ ...params, tempo: selected ? null : n })} selected={selected}>
              {t("timeUpTo", { n })}
            </ChipLink>
          );
        })}
        {categories.map((c) => {
          const selected = params.cat === c.code;
          return (
            <ChipLink key={c.code} document href={href({ ...params, cat: selected ? null : c.code })} selected={selected}>
              {c.label}
            </ChipLink>
          );
        })}
      </ChipRow>

      <details className="group rounded-2xl border border-border bg-surface" data-testid="recipe-filters-panel">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t("button")}
            {panelCount > 0 ? <span className="rounded-full bg-fg px-2 py-0.5 text-xs text-bg">{panelCount}</span> : null}
          </span>
          <span className="type-caption text-fg-muted group-open:hidden">{t("open")}</span>
          <span className="hidden type-caption text-fg-muted group-open:inline">{t("close")}</span>
        </summary>
        <GetForm action={base} defaults={{ ordem: "relevance" }} className="flex flex-col gap-5 border-t border-border px-4 py-4" aria-label={t("title")}>
          <Hidden entries={[...fixed, ...carry(params, ["cat", "tempo", "dif", "dieta", "sem", "ordem"])]} />
          <div className="grid gap-5 md:grid-cols-2">
            <Group legend={t("category")}>
              <Choice type="radio" name="cat" value="" checked={!params.cat} id={id("cat", "")}>
                {t("any")}
              </Choice>
              {categories.map((c) => (
                <Choice key={c.code} type="radio" name="cat" value={c.code} checked={params.cat === c.code} id={id("cat", c.code)}>
                  {c.label}
                </Choice>
              ))}
            </Group>
            <div className="flex flex-col gap-5">
              <Group legend={t("time")}>
                <Choice type="radio" name="tempo" value="" checked={!params.tempo} id={id("tempo", "")}>
                  {t("any")}
                </Choice>
                {RECIPE_TIME_LIMITS.map((n) => (
                  <Choice key={n} type="radio" name="tempo" value={String(n)} checked={params.tempo === n} id={id("tempo", String(n))}>
                    {t("timeUpTo", { n })}
                  </Choice>
                ))}
              </Group>
              <Group legend={t("difficulty")}>
                <Choice type="radio" name="dif" value="" checked={!params.dif} id={id("dif", "")}>
                  {t("any")}
                </Choice>
                {RECIPE_DIFFICULTIES.map((d) => (
                  <Choice key={d} type="radio" name="dif" value={d} checked={params.dif === d} id={id("dif", d)}>
                    {tcat(`difficulty.${d}`)}
                  </Choice>
                ))}
              </Group>
            </div>
            <Group legend={`${t("diets")} · ${t("declaredShort")}`} hint={t("dietsHint")}>
              {RECIPE_DIETS.map((d) => (
                <Choice key={d} type="checkbox" name="dieta" value={d} checked={params.dieta.includes(d)} id={id("dieta", d)}>
                  {td(d)}
                </Choice>
              ))}
            </Group>
            <Group legend={`${t("allergens")} · ${t("declaredShort")}`} hint={t("allergensHint")}>
              {RECIPE_ALLERGENS.map((a) => (
                <Choice key={a} type="checkbox" name="sem" value={a} checked={params.sem.includes(a)} id={id("sem", a)}>
                  {t("without", { allergen: ta(a) })}
                </Choice>
              ))}
            </Group>
            <Group legend={t("sort")}>
              {RECIPE_CATALOG_SORTS.map((s) => (
                <Choice key={s} type="radio" name="ordem" value={s} checked={params.ordem === s} id={id("ordem", s)}>
                  {ts(s)}
                </Choice>
              ))}
            </Group>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <Button asChild variant="ghost">
              <a href={href({ ...EMPTY_RECIPE_PARAMS, q: params.q })}>{t("clearAll")}</a>
            </Button>
            <Button type="submit" variant="primary" data-testid="recipe-filters-apply">
              {t("apply")}
            </Button>
          </div>
        </GetForm>
      </details>

      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("active")} data-testid="recipe-active-filters">
          {active.map((f) => (
            <a
              key={`${f.key}-${f.value}`}
              href={href(withoutRecipeFilter(params, f))}
              aria-label={t("remove", { label: labelOf(f) })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-fg bg-fg px-3.5 text-sm font-medium text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {labelOf(f)}
              <X className="size-4" aria-hidden="true" />
            </a>
          ))}
          <a
            href={href({ ...EMPTY_RECIPE_PARAMS, q: params.q })}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="recipe-filters-clear"
          >
            {t("clearAll")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
