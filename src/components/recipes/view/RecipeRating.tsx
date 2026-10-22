"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { rateRecipe } from "@/app/(app)/content/recipe-actions";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = { contentId: string; path: string; initial: number | null };

const STARS = [1, 2, 3, 4, 5] as const;

// Avaliação por estrelas: radiogroup nativo (setas do teclado trocam a nota), oferecido só a quem
// concluiu a receita (a página decide; o banco confere de novo). Gravar a nota é imediato.
export function RecipeRating({ contentId, path, initial }: Props) {
  const t = useTranslations("recipes.page.rating");
  const { toast } = useToast();
  const [stars, setStars] = useState<number | null>(initial);
  const [pending, startTransition] = useTransition();
  const name = useId();

  function choose(value: number) {
    const previous = stars;
    setStars(value);
    startTransition(async () => {
      const result = await rateRecipe({ contentId, stars: value, path });
      if (result.ok) {
        toast({ title: t("saved"), variant: "success" });
        return;
      }
      setStars(previous);
      toast({ title: t(`errors.${result.error}`), variant: "error" });
    });
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3 print:hidden" aria-busy={pending || undefined} data-testid="recipe-rating">
      <legend className="sr-only">{t("legend")}</legend>
      <p className="text-sm font-semibold text-fg" aria-hidden="true">
        {t("legend")}
      </p>
      <div role="radiogroup" aria-label={t("legend")} className="flex gap-1">
        {STARS.map((value) => {
          const active = stars !== null && value <= stars;
          return (
            <label key={value} className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
              <input type="radio" name={name} value={value} checked={stars === value} disabled={pending} onChange={() => choose(value)} className="peer sr-only" aria-label={t("star", { n: value })} />
              <Star aria-hidden="true" className={cn("size-6", active ? "fill-current text-accent-text" : "text-fg-subtle")} />
            </label>
          );
        })}
      </div>
      <p className="type-caption text-fg-muted">{stars ? t("yours", { n: stars }) : t("hint")}</p>
    </fieldset>
  );
}
