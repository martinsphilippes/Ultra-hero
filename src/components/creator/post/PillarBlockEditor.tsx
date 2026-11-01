"use client";

import { ChefHat, Dumbbell, Plus, Salad, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import { Button, FormField, IconButton, Input, Select, Textarea } from "@/components/ui";
import type { ProductOption, RecipeOption } from "@/lib/post-blocks/queries";
import {
  BLOCK_DESCRIPTION_MAX,
  BLOCK_NAME_MAX,
  BLOCK_NOTE_MAX,
  BLOCK_STEP_MAX,
  MENU_OPTIONS_MAX,
  NUTRITION_ITEMS_MAX,
  PILLAR_BLOCK,
  WORKOUT_STEPS_MAX,
  type BlockDrafts,
  type NutritionItem,
} from "@/lib/post-blocks/schema";
import type { Pillar } from "@/lib/supabase/helpers";

export type PillarBlockOptions = { recipes: RecipeOption[]; products: ProductOption[] };

type Props = {
  pillar: Pillar;
  drafts: BlockDrafts;
  onChange: (next: BlockDrafts) => void;
  options: PillarBlockOptions;
  /** Para onde vai quem ainda não tem receita (cadastro) ou produto ligado (vínculos). */
  hrefs: { newRecipe: string; links: string };
  error?: string | null;
  disabled?: boolean;
};

// Campos que o pilar abre no Novo post (0075). Rotina: nada. Treino: explicação e passos (cada
// seguidor marca os seus). Nutrição: receita já cadastrada, produto da loja ou prato livre; sem
// receita, o atalho leva ao cadastro. Gastronomia: cardápio do chef com até 5 opções.
export function PillarBlockEditor({ pillar, drafts, onChange, options, hrefs, error, disabled = false }: Props) {
  const t = useTranslations("creator.post.blocks");
  const baseId = useId();
  const kind = PILLAR_BLOCK[pillar];
  if (!kind) return null;

  if (kind === "workout") {
    const w = drafts.workout;
    const setSteps = (steps: string[]) => onChange({ ...drafts, workout: { ...w, steps } });
    return (
      <section aria-labelledby={`${baseId}-workout`} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-4" data-testid="block-workout">
        <h3 id={`${baseId}-workout`} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Dumbbell className="size-4 text-accent-text" aria-hidden="true" />
          {t("workout.title")}
        </h3>
        <p className="type-caption text-fg-muted">{t("workout.hint")}</p>
        <FormField label={t("workout.description")} hint={t("counter", { count: w.description.length, max: BLOCK_DESCRIPTION_MAX })}>
          <Textarea value={w.description} maxLength={BLOCK_DESCRIPTION_MAX} rows={3} placeholder={t("workout.descriptionPlaceholder")} disabled={disabled} onChange={(e) => onChange({ ...drafts, workout: { ...w, description: e.target.value } })} />
        </FormField>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg" id={`${baseId}-steps`}>
            {t("workout.steps")}
          </p>
          <ol className="flex flex-col gap-2" aria-labelledby={`${baseId}-steps`}>
            {w.steps.map((step, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-sm font-semibold text-fg-muted">{index + 1}</span>
                <Input
                  aria-label={t("workout.stepN", { n: index + 1 })}
                  value={step}
                  maxLength={BLOCK_STEP_MAX}
                  placeholder={t("workout.stepPlaceholder")}
                  disabled={disabled}
                  onChange={(e) => setSteps(w.steps.map((s, i) => (i === index ? e.target.value : s)))}
                  data-testid="block-workout-step"
                />
                {w.steps.length > 1 ? <IconButton label={t("workout.removeStep", { n: index + 1 })} icon={<Trash2 />} variant="ghost" disabled={disabled} onClick={() => setSteps(w.steps.filter((_, i) => i !== index))} /> : null}
              </li>
            ))}
          </ol>
          {w.steps.length < WORKOUT_STEPS_MAX ? (
            <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} className="w-fit" disabled={disabled} onClick={() => setSteps([...w.steps, ""])} data-testid="block-workout-add">
              {t("workout.addStep")}
            </Button>
          ) : null}
        </div>
        {error ? <ErrorLine text={error} /> : null}
      </section>
    );
  }

  if (kind === "nutrition") {
    const items = drafts.nutrition.items;
    const setItems = (next: NutritionItem[]) => onChange({ ...drafts, nutrition: { items: next } });
    const full = items.length >= NUTRITION_ITEMS_MAX;
    const chosenRecipes = new Set(items.flatMap((i) => (i.kind === "recipe" ? [i.content_id] : [])));
    const chosenProducts = new Set(items.flatMap((i) => (i.kind === "product" ? [i.product_id] : [])));
    const label = (item: NutritionItem) =>
      item.kind === "recipe" ? (options.recipes.find((r) => r.id === item.content_id)?.title ?? t("nutrition.recipe")) : item.kind === "product" ? (options.products.find((p) => p.id === item.product_id)?.title ?? t("nutrition.product")) : item.name;
    return (
      <section aria-labelledby={`${baseId}-nutrition`} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-4" data-testid="block-nutrition">
        <h3 id={`${baseId}-nutrition`} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Salad className="size-4 text-accent-text" aria-hidden="true" />
          {t("nutrition.title")}
        </h3>
        <p className="type-caption text-fg-muted">{t("nutrition.hint")}</p>

        {items.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label={t("nutrition.chosen")}>
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2" data-testid="block-nutrition-item">
                <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">{t(`nutrition.${item.kind}`)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{label(item)}</span>
                <IconButton label={t("nutrition.remove", { name: label(item) })} icon={<Trash2 />} variant="ghost" size="sm" disabled={disabled} onClick={() => setItems(items.filter((_, i) => i !== index))} />
              </li>
            ))}
          </ul>
        ) : null}

        {!full ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("nutrition.pickRecipe")} hint={options.recipes.length === 0 ? t("nutrition.noRecipes") : undefined}>
              {options.recipes.length === 0 ? (
                <Button asChild variant="secondary" size="sm" className="w-fit">
                  <Link href={hrefs.newRecipe}>{t("nutrition.createRecipe")}</Link>
                </Button>
              ) : (
                <Select
                  value=""
                  disabled={disabled}
                  aria-label={t("nutrition.pickRecipe")}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !chosenRecipes.has(id)) setItems([...items, { kind: "recipe", content_id: id }]);
                  }}
                  data-testid="block-nutrition-recipe"
                >
                  <option value="">{t("nutrition.choose")}</option>
                  {options.recipes.map((r) => (
                    <option key={r.id} value={r.id} disabled={chosenRecipes.has(r.id)}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label={t("nutrition.pickProduct")} hint={options.products.length === 0 ? t("nutrition.noProducts") : undefined}>
              {options.products.length === 0 ? (
                <Button asChild variant="secondary" size="sm" className="w-fit">
                  <Link href={hrefs.links}>{t("nutrition.requestProduct")}</Link>
                </Button>
              ) : (
                <Select
                  value=""
                  disabled={disabled}
                  aria-label={t("nutrition.pickProduct")}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !chosenProducts.has(id)) setItems([...items, { kind: "product", product_id: id }]);
                  }}
                  data-testid="block-nutrition-product"
                >
                  <option value="">{t("nutrition.choose")}</option>
                  {options.products.map((p) => (
                    <option key={p.id} value={p.id} disabled={chosenProducts.has(p.id)}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
        ) : (
          <p className="type-caption text-fg-muted">{t("nutrition.full", { max: NUTRITION_ITEMS_MAX })}</p>
        )}

        {!full ? <DishForm disabled={disabled} onAdd={(dish) => setItems([...items, dish])} /> : null}
        {error ? <ErrorLine text={error} /> : null}
      </section>
    );
  }

  const menu = drafts.menu.options;
  const setOptions = (next: BlockDrafts["menu"]["options"]) => onChange({ ...drafts, menu: { options: next } });
  return (
    <section aria-labelledby={`${baseId}-menu`} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-4" data-testid="block-menu">
      <h3 id={`${baseId}-menu`} className="flex items-center gap-2 text-sm font-semibold text-fg">
        <ChefHat className="size-4 text-accent-text" aria-hidden="true" />
        {t("menu.title")}
      </h3>
      <p className="type-caption text-fg-muted">{t("menu.hint")}</p>
      <ol className="flex flex-col gap-3">
        {menu.map((option, index) => (
          <li key={index} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3" data-testid="block-menu-option">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-fg">{t("menu.optionN", { n: index + 1 })}</span>
              {menu.length > 1 ? <IconButton label={t("menu.removeOption", { n: index + 1 })} icon={<Trash2 />} variant="ghost" size="sm" disabled={disabled} onClick={() => setOptions(menu.filter((_, i) => i !== index))} /> : null}
            </div>
            <FormField label={t("menu.name")} required>
              <Input value={option.name} maxLength={BLOCK_NAME_MAX} placeholder={t("menu.namePlaceholder")} disabled={disabled} onChange={(e) => setOptions(menu.map((o, i) => (i === index ? { ...o, name: e.target.value } : o)))} data-testid="block-menu-name" />
            </FormField>
            <FormField label={t("menu.description")} hint={t("counter", { count: option.description.length, max: BLOCK_NOTE_MAX })}>
              <Textarea value={option.description} maxLength={BLOCK_NOTE_MAX} rows={2} disabled={disabled} onChange={(e) => setOptions(menu.map((o, i) => (i === index ? { ...o, description: e.target.value } : o)))} />
            </FormField>
            <FormField label={t("menu.recipe")} hint={options.recipes.length === 0 ? t("menu.noRecipes") : undefined}>
              {options.recipes.length === 0 ? (
                <Button asChild variant="secondary" size="sm" className="w-fit">
                  <Link href={hrefs.newRecipe}>{t("nutrition.createRecipe")}</Link>
                </Button>
              ) : (
                <Select value={option.recipe_id ?? ""} disabled={disabled} onChange={(e) => setOptions(menu.map((o, i) => (i === index ? { ...o, recipe_id: e.target.value || null } : o)))}>
                  <option value="">{t("menu.noRecipe")}</option>
                  {options.recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </li>
        ))}
      </ol>
      {menu.length < MENU_OPTIONS_MAX ? (
        <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} className="w-fit" disabled={disabled} onClick={() => setOptions([...menu, { name: "", description: "", recipe_id: null }])} data-testid="block-menu-add">
          {t("menu.addOption")}
        </Button>
      ) : null}
      {error ? <ErrorLine text={error} /> : null}
    </section>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="type-caption font-medium text-danger">
      {text}
    </p>
  );
}

// Prato livre: nome e descrição, acrescentado à lista com um toque (sem receita cadastrada).
function DishForm({ disabled, onAdd }: { disabled: boolean; onAdd: (dish: NutritionItem) => void }) {
  const t = useTranslations("creator.post.blocks.nutrition");
  const id = useId();
  return (
    <details className="rounded-xl border border-dashed border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-medium text-fg-muted">{t("dishTitle")}</summary>
      <form
        className="flex flex-col gap-3 px-3 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = (form.elements.namedItem(`${id}-name`) as HTMLInputElement | null)?.value.trim() ?? "";
          const description = (form.elements.namedItem(`${id}-desc`) as HTMLTextAreaElement | null)?.value.trim() ?? "";
          if (!name) return;
          onAdd({ kind: "dish", name, description });
          form.reset();
        }}
      >
        <FormField label={t("dishName")} required>
          <Input name={`${id}-name`} maxLength={BLOCK_NAME_MAX} disabled={disabled} data-testid="block-dish-name" />
        </FormField>
        <FormField label={t("dishDescription")}>
          <Textarea name={`${id}-desc`} maxLength={BLOCK_NOTE_MAX} rows={2} disabled={disabled} />
        </FormField>
        <Button type="submit" variant="secondary" size="sm" className="w-fit" disabled={disabled} data-testid="block-dish-add">
          {t("dishAdd")}
        </Button>
      </form>
    </details>
  );
}
