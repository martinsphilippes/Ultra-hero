import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONTENT_TYPES, PILLARS } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";
import { ChipLink, ChipRow } from "../ChipLink";
import { PILLAR_ICON } from "../pillars";
import { ACCESS_LEVELS, DIFFICULTIES, exploreHref, secondaryFilterCount, type ExploreParams } from "./params";

// Linha de pilares (sempre visível) para qualquer aba que filtre por pilar.
export async function PillarChips({ params, tab }: { params: ExploreParams; tab: ExploreParams["tab"] }) {
  const [t, tp] = await Promise.all([getTranslations("discover.explore.filters"), getTranslations("common.pillars")]);
  const base = { ...params, tab };
  return (
    <ChipRow label={t("pillar")}>
      <ChipLink href={exploreHref(base, { pillar: null })} selected={!params.pillar}>
        {t("all")}
      </ChipLink>
      {PILLARS.map((pillar) => {
        const Icon = PILLAR_ICON[pillar];
        return (
          <ChipLink key={pillar} href={exploreHref(base, { pillar })} selected={params.pillar === pillar} variant={pillar} icon={<Icon />}>
            {tp(pillar)}
          </ChipLink>
        );
      })}
    </ChipRow>
  );
}

// Filtros secundários da aba de conteúdos (tipo, acesso, nível) num bloco recolhível sem JS.
export async function ContentFilters({ params }: { params: ExploreParams }) {
  const [t, tc, tcat] = await Promise.all([
    getTranslations("discover.explore.filters"),
    getTranslations("common.plans"),
    getTranslations("catalog"),
  ]);
  const active = secondaryFilterCount(params);
  const base = { ...params, tab: "conteudos" as const };

  return (
    <div className="flex flex-col gap-3">
      <PillarChips params={params} tab="conteudos" />

      <details open={active > 0} className="group rounded-xl border border-border bg-surface">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-fg",
            "rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-fg-muted" aria-hidden="true" />
            {active > 0 ? t("summaryActive", { count: active }) : t("summary")}
          </span>
          <ChevronDown className="size-4 text-fg-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <ChipRow label={t("type")} showLabel bleed={false}>
            <ChipLink href={exploreHref(base, { type: null })} selected={!params.type}>
              {t("all")}
            </ChipLink>
            {CONTENT_TYPES.map((type) => (
              <ChipLink key={type} href={exploreHref(base, { type })} selected={params.type === type}>
                {tcat(`types.${type}`)}
              </ChipLink>
            ))}
          </ChipRow>

          <ChipRow label={t("access")} showLabel bleed={false}>
            <ChipLink href={exploreHref(base, { access: null })} selected={!params.access}>
              {t("all")}
            </ChipLink>
            {ACCESS_LEVELS.map((access) => (
              <ChipLink key={access} href={exploreHref(base, { access })} selected={params.access === access} variant={access}>
                {tc(access)}
              </ChipLink>
            ))}
          </ChipRow>

          <ChipRow label={t("difficulty")} showLabel bleed={false}>
            <ChipLink href={exploreHref(base, { difficulty: null })} selected={!params.difficulty}>
              {t("all")}
            </ChipLink>
            {DIFFICULTIES.map((difficulty) => (
              <ChipLink key={difficulty} href={exploreHref(base, { difficulty })} selected={params.difficulty === difficulty}>
                {tcat(`difficulty.${difficulty}`)}
              </ChipLink>
            ))}
          </ChipRow>

          {active > 0 || params.pillar ? (
            <Link
              href={exploreHref(base, { pillar: null, type: null, access: null, difficulty: null })}
              className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t("clearAll")}
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}
