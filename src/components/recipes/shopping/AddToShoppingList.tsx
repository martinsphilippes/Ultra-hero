"use client";

import { ListPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addRecipeToShoppingList } from "@/app/(app)/profile/lista-de-compras/actions";
import { Button, Checkbox, Sheet, buttonBase, buttonSizes, buttonVariants, useToast } from "@/components/ui";
import { RECIPE_UNITS, type RecipeUnit } from "@/lib/recipes/codes";
import { parseServingsParam, servingsFactor } from "@/lib/recipes/scale";
import type { RecipeActionTrack } from "@/lib/recipes/showcase";
import { defaultShoppingSelection, SHOPPING_LIST_PATH } from "@/lib/recipes/shopping";
import { scaledAmount, type UnitLabels, type ViewQuantity } from "@/lib/recipes/view-model";
import { cn } from "@/lib/utils";
import { fireRecipeAction } from "../showcase/track-action";

export type ShoppingSheetIngredient = ViewQuantity & { id: string; name: string; toTaste: boolean; optional: boolean };

type Props = {
  contentId: string;
  ingredients: ShoppingSheetIngredient[];
  /** Porções da receita (sem elas não há ajuste). */
  baseServings: number | null;
  locale: string;
  /** Indicador da vitrine (0051): abrir a lista conta um toque em "Lista de compras". */
  track?: RecipeActionTrack | null;
};

/** Botão "Adicionar à lista de compras" com as porções da URL (?porcoes=, mantidas pelo painel de ingredientes). */
export function AddToShoppingList(props: Props) {
  const servings = parseServingsParam(useSearchParams().get("porcoes"));
  return <AddToShoppingListView {...props} servings={servings} />;
}

// Lista de compras a partir da receita (fase 5, decisão 5): o Sheet mostra os ingredientes já com o
// fator de porções da página; "a gosto" e item sem quantidade vêm desmarcados; nada é convertido
// para embalagem. O servidor recalcula as quantidades a partir das tabelas e confere o acesso.
export function AddToShoppingListView({ contentId, ingredients, baseServings, locale, servings, track = null }: Props & { servings: number | null }) {
  const t = useTranslations("shopping.add");
  const te = useTranslations("shopping.errors");
  const tu = useTranslations("recipes.structured.units");
  const tp = useTranslations("recipes.page");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const labels = useMemo(() => Object.fromEntries(RECIPE_UNITS.map((u) => [u, [tu(`${u}.one`), tu(`${u}.other`)] as const])) as Record<RecipeUnit, readonly [string, string]> as UnitLabels, [tu]);
  const target = servings ?? baseServings;
  const factor = servingsFactor(baseServings, target);
  const rows = useMemo(
    () => ingredients.map((ing) => ({ ing, amount: ing.toTaste ? null : scaledAmount(ing, factor, labels, locale) })),
    [ingredients, factor, labels, locale],
  );

  function openSheet() {
    fireRecipeAction(track, "lista_compras");
    setSelected(new Set(defaultShoppingSelection(ingredients.map((i, index) => ({ ...i, position: index + 1 })))));
    setError(null);
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    const ids = ingredients.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await addRecipeToShoppingList({ contentId, ingredientIds: ids, servings: target !== baseServings ? target : null });
      if (!result.ok) {
        setError(te.has(result.error) ? te(result.error) : te("generic"));
        return;
      }
      setOpen(false);
      setDone(true);
      const description = t("addedDescription", { added: result.added, updated: result.updated });
      setAnnounce(`${t("added")}. ${description}`);
      toast({
        title: t("added"),
        description: (
          <span className="flex flex-col gap-1">
            <span>{description}</span>
            <Link href={SHOPPING_LIST_PATH} className="font-semibold text-accent-text underline-offset-4 hover:underline">
              {t("viewList")}
            </Link>
          </span>
        ),
        variant: "success",
      });
    });
  }

  const count = selected.size;

  return (
    <>
      <Button type="button" variant="secondary" leadingIcon={<ListPlus />} onClick={openSheet} data-testid="recipe-shopping-add">
        {t("button")}
      </Button>
      {/* atalho que fica depois de adicionar (o toast some sozinho) */}
      {done ? (
        <Link href={SHOPPING_LIST_PATH} className={cn(buttonBase, buttonVariants.ghost, buttonSizes.md)} data-testid="recipe-shopping-view">
          {t("viewList")}
        </Link>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title")}
        description={target ? t("description", { n: target }) : t("descriptionNoServings")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={submit} loading={pending} disabled={count === 0} data-testid="recipe-shopping-submit">
              {t("submit", { n: count })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-2" data-testid="recipe-shopping-sheet">
          <p className="type-caption text-fg-muted">{t("hint")}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-caption font-semibold text-fg" aria-live="polite">
              {t("selected", { n: count })}
            </p>
            <div className="flex gap-1">
              <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={() => setSelected(new Set(ingredients.map((i) => i.id)))}>
                {t("selectAll")}
              </button>
              <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={() => setSelected(new Set())}>
                {t("selectNone")}
              </button>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-border" aria-label={t("listLabel")}>
            {rows.map(({ ing, amount }) => {
              const detail = ing.toTaste
                ? t("toTaste")
                : amount?.text
                  ? `${amount.approx ? "≈ " : ""}${amount.text}${!amount.scaled && factor !== 1 ? ` · ${tp("notScaled")}` : ""}`
                  : t("noAmount");
              return (
                <li key={ing.id} data-testid="recipe-shopping-item">
                  <Checkbox
                    id={`shopping-${ing.id}`}
                    checked={selected.has(ing.id)}
                    onChange={() => toggle(ing.id)}
                    label={ing.optional ? `${ing.name} (${t("optional")})` : ing.name}
                    description={detail}
                  />
                </li>
              );
            })}
          </ul>
          {error ? (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 type-body-sm text-fg" data-testid="recipe-shopping-error">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
