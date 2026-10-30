"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { OUTBOUND_REL, relationshipStyle, type BrandChipView } from "@/lib/brands";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { trackBrandClick } from "./track";

type Props = {
  brands: readonly BrandChipView[];
  /** Nome do herói (rótulo da lista para leitor de tela). */
  heroName: string;
  className?: string;
};

const TONE = {
  // patrocinador: contorno no acento com brilho leve
  solid: "border-accent/70 bg-accent-soft shadow-[0_0_18px_-8px_var(--color-accent)]",
  // marca mencionada: contorno neutro
  outline: "border-border-strong bg-surface-elevated",
  // produto identificado: contorno tracejado no ciano das Smart Tags
  dashed: "border-dashed border-[color-mix(in_oklab,#14b8a6_55%,transparent)] bg-surface",
} as const;

// ciano misturado à cor do texto: claro no tema escuro, escuro no claro (contraste nos dois e nos templates)
const LABEL_TONE = { solid: "text-accent-text", outline: "text-fg-muted", dashed: "text-[color-mix(in_oklab,#14b8a6_60%,var(--color-fg))]" } as const;

// Marcas ao lado do nome do herói (página do herói, do programa e do conteúdo): logos pequenos em
// chips, rolagem lateral quando são muitas. Cada chip abre o site da marca (fora do app) e diz o
// tipo de relação: patrocinador, marca mencionada ou produto identificado.
export function BrandStrip({ brands, heroName, className }: Props) {
  const t = useTranslations("brands");
  if (brands.length === 0) return null;
  return (
    <ul aria-label={t("strip.label", { name: heroName })} className={cn("uh-brand-strip -mx-1 flex snap-x gap-2 overflow-x-auto px-1 py-1", className)} data-testid="brand-strip">
      {brands.map((brand) => {
        const style = relationshipStyle(brand.relationship);
        const label = t(style.labelKey);
        return (
          <li key={brand.id} className="shrink-0 snap-start">
            <a
              href={brand.site_url}
              target="_blank"
              rel={OUTBOUND_REL}
              onClick={() => trackBrandClick({ kind: "brand", id: brand.id, source: "strip" })}
              className={cn(
                "group flex min-h-11 items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                TONE[style.tone],
              )}
              data-testid="brand-chip"
              data-relationship={brand.relationship}
            >
              <BrandLogo name={brand.name} logoUrl={brand.logo_url} className="h-7 max-w-[96px]" />
              <span className="flex flex-col leading-tight">
                <span className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", LABEL_TONE[style.tone])}>{label}</span>
                {brand.is_demo ? <span className="text-[10px] text-fg-subtle">{t("example")}</span> : null}
              </span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              <span className="sr-only">
                {brand.name} — {label}
                {brand.is_demo ? ` (${t("example")})` : ""} — {t("strip.opensSite")}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
