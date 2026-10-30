"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchProductsAction } from "@/app/admin/content-actions";
import { setRecipeReadyProductAction, setRecipeShowcaseHeroAction, setRecipeSignerAction } from "@/app/admin/content/showcase-actions";
import type { ActionResult } from "@/components/admin";
import { Badge, Button, FormField, Select, useToast } from "@/components/ui";
import { SearchPicker, type PickItem } from "./SearchPicker";

type Hero = { id: string; name: string };

type Props = {
  contentId: string;
  /** Autor da receita (content.creator): a receita sempre está na vitrine dele. */
  author: Hero | null;
  /** Heróis com a receita na vitrine (vínculo validado). */
  showcase: Hero[];
  /** Heróis ativos (para adicionar à vitrine e para escolher o chef). */
  heroes: Hero[];
  /** false = 0051 ausente: só os heróis da vitrine (0024) podem ser editados. */
  available: boolean;
  /** Valor do seletor "Quem assina": "author", "none" ou o id do chef. */
  signer: string;
  ready: { id: string; title: string; status: string } | null;
};

// Painel "Vitrine (Alimentação)" da receita no admin (0051), pensado para o celular: em que vitrines
// a receita aparece, quem assina (chef opcional) e o produto "Comprar pronto". Cada mudança é uma
// ação auditada no banco; a tela recarrega os dados depois.
export function RecipeShowcaseAdmin({ contentId, author, showcase, heroes, available, signer, ready }: Props) {
  const t = useTranslations("adminContent.content.showcase");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addHero, setAddHero] = useState("");
  const [signerValue, setSignerValue] = useState(signer);
  const [product, setProduct] = useState<PickItem | null>(null);

  const inShowcase = new Set([author?.id, ...showcase.map((h) => h.id)]);
  const candidates = heroes.filter((h) => !inShowcase.has(h.id));

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast({ title: result.message ?? t("messages.saved"), variant: "success" });
        after?.();
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="recipe-showcase-admin">
      {/* 1) vitrines */}
      <section aria-labelledby="showcase-heroes" className="flex flex-col gap-3">
        <h3 id="showcase-heroes" className="text-sm font-semibold text-fg">
          {t("heroes.title")}
        </h3>
        <p className="type-caption text-fg-muted">{t("heroes.hint")}</p>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="showcase-hero-list">
          {author ? (
            <li className="flex min-h-11 items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm text-fg">{author.name}</span>
              <Badge size="sm">{t("heroes.author")}</Badge>
            </li>
          ) : null}
          {showcase.map((hero) => (
            <li key={hero.id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-2" data-testid="showcase-hero">
              <span className="text-sm text-fg">{hero.name}</span>
              <Button type="button" variant="ghost" size="sm" leadingIcon={<X />} disabled={pending} onClick={() => run(() => setRecipeShowcaseHeroAction(contentId, hero.id, false))}>
                {t("heroes.remove")}
                <span className="sr-only"> ({hero.name})</span>
              </Button>
            </li>
          ))}
          {!author && showcase.length === 0 ? <li className="px-3 py-2 type-caption text-fg-muted">{t("heroes.empty")}</li> : null}
        </ul>
        {candidates.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField label={t("heroes.add")} className="flex-1">
              <Select value={addHero} onChange={(e) => setAddHero(e.target.value)} data-testid="showcase-hero-select">
                <option value="">{t("heroes.pick")}</option>
                {candidates.map((hero) => (
                  <option key={hero.id} value={hero.id}>
                    {hero.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="button" variant="secondary" leadingIcon={<Plus />} disabled={!addHero || pending} onClick={() => run(() => setRecipeShowcaseHeroAction(contentId, addHero, true), () => setAddHero(""))}>
              {t("heroes.addButton")}
            </Button>
          </div>
        ) : null}
      </section>

      {!available ? (
        <p role="note" className="rounded-lg border border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-fg" data-testid="recipe-showcase-unavailable">
          {t("unavailable")}
        </p>
      ) : (
        <>
          {/* 2) quem assina */}
          <section aria-labelledby="showcase-signer" className="flex flex-col gap-3">
            <h3 id="showcase-signer" className="text-sm font-semibold text-fg">
              {t("signer.title")}
            </h3>
            <FormField label={t("signer.label")} hint={t("signer.hint")}>
              <Select value={signerValue} onChange={(e) => setSignerValue(e.target.value)} data-testid="showcase-signer-select">
                <option value="author">{author ? t("signer.author", { name: author.name }) : t("signer.authorNone")}</option>
                <option value="none">{t("signer.none")}</option>
                {heroes
                  .filter((hero) => hero.id !== author?.id)
                  .map((hero) => (
                    <option key={hero.id} value={hero.id}>
                      {hero.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            <Button type="button" variant="secondary" className="w-fit" disabled={signerValue === signer || pending} onClick={() => run(() => setRecipeSignerAction(contentId, signerValue))} data-testid="showcase-signer-save">
              {t("signer.save")}
            </Button>
          </section>

          {/* 3) comprar pronto */}
          <section aria-labelledby="showcase-ready" className="flex flex-col gap-3">
            <h3 id="showcase-ready" className="text-sm font-semibold text-fg">
              {t("ready.title")}
            </h3>
            <p className="type-caption text-fg-muted">{t("ready.hint")}</p>
            {ready ? (
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2" data-testid="showcase-ready-current">
                <span className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  {ready.title}
                  {ready.status !== "published" ? (
                    <Badge variant="warning" size="sm">
                      {t("ready.notPublished")}
                    </Badge>
                  ) : null}
                </span>
                <Button type="button" variant="ghost" size="sm" leadingIcon={<X />} disabled={pending} onClick={() => run(() => setRecipeReadyProductAction(contentId, null))}>
                  {t("ready.remove")}
                </Button>
              </div>
            ) : (
              <p className="type-caption text-fg-muted">{t("ready.empty")}</p>
            )}
            <SearchPicker label={ready ? t("ready.replace") : t("ready.pick")} search={searchProductsAction} value={product} onChange={setProduct} />
            <Button type="button" variant="secondary" className="w-fit" disabled={!product || pending} onClick={() => product && run(() => setRecipeReadyProductAction(contentId, product.id), () => setProduct(null))}>
              {t("ready.save")}
            </Button>
          </section>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
