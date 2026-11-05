"use client";

import { Check, Columns3, Plus, Star, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { TalentCardCompact } from "@/components/brand-portal/TalentCardView";
import { Badge, Button } from "@/components/ui";
import type { TalentCard } from "@/lib/deals/queries";
import { canCompare, compareHref, COMPARE_MAX, formatAvg, toggleCompare, type RatingSummary } from "@/lib/selection/logic";

type Props = { cards: TalentCard[]; ratings: Record<string, RatingSummary> };

// Catálogo da marca (0081): cada cartão com a nota média da marca (quando houver) e "Comparar"; a barra fixa leva a
// comparação lado a lado de 2 a 4 creators. Mobile first: botões de 44px (tamanho padrão) e a barra no rodapé.
export function CatalogGrid({ cards, ratings }: Props) {
  const t = useTranslations("selection.compare");
  const tr = useTranslations("selection.rating");
  const locale = useLocale();
  const [ids, setIds] = useState<string[]>([]);
  const full = ids.length >= COMPARE_MAX;

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="catalog-list">
        {cards.map((card) => {
          const r = ratings[card.id];
          const on = ids.includes(card.id);
          return (
            <li key={card.id} className="flex flex-col gap-1.5">
              <TalentCardCompact card={card} href={`/marca/herois/${card.id}`} />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                {r && r.count > 0 ? (
                  <Badge variant="accent" icon={<Star aria-hidden="true" />} data-testid="catalog-rating">
                    {tr("catalogBadge", {
                      avg: formatAvg(r.avg, locale) ?? "—",
                      count: r.count,
                    })}
                  </Badge>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant={on ? "primary" : "ghost"}
                  leadingIcon={on ? <Check /> : <Plus />}
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => setIds((cur) => toggleCompare(cur, card.id))}
                  data-testid="compare-toggle"
                >
                  {on ? t("toggleOn") : t("toggle")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {ids.length > 0 ? (
        <div
          className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3 shadow-lg"
          data-testid="compare-tray"
          role="region"
          aria-label={t("title")}
        >
          <span className="text-sm font-medium text-fg">{t("tray", { count: ids.length })}</span>
          <span className="flex gap-2">
            <Button type="button" variant="ghost" leadingIcon={<X />} onClick={() => setIds([])}>
              {t("clear")}
            </Button>
            {canCompare(ids) ? (
              <Button asChild leadingIcon={<Columns3 />}>
                <Link href={compareHref(ids)} data-testid="compare-go">
                  {t("go")}
                </Link>
              </Button>
            ) : (
              <Button type="button" leadingIcon={<Columns3 />} disabled>
                {t("go")}
              </Button>
            )}
          </span>
        </div>
      ) : null}
    </>
  );
}
