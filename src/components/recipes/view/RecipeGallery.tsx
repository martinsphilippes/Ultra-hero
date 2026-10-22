"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, type KeyboardEvent } from "react";
import { IconButton } from "@/components/ui";
import type { ViewPhoto } from "@/lib/recipes/view-model";
import { cn } from "@/lib/utils";

// Galeria da receita: foto grande (capa primeiro), miniaturas e setas. Carrossel acessível: região
// rotulada, posição anunciada, ← e → trocam a foto quando o foco está na galeria.
export function RecipeGallery({ photos, unoptimized }: { photos: ViewPhoto[]; unoptimized: boolean }) {
  const t = useTranslations("recipes.view");
  const [index, setIndex] = useState(0);
  const labels = {
    region: t("gallery"),
    position: (n: number, total: number) => t("galleryPosition", { n, total }),
    previous: t("previous"),
    next: t("next"),
    hint: t("galleryHint"),
  };
  if (photos.length === 0) return null;
  const current = photos[Math.min(index, photos.length - 1)];
  const go = (next: number) => setIndex((next + photos.length) % photos.length);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (photos.length < 2) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  }

  return (
    <section aria-roledescription="carousel" aria-label={labels.region} onKeyDown={onKeyDown} className="flex flex-col gap-2" data-testid="recipe-gallery">
      <figure className="flex flex-col gap-1.5">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <Image src={current.src} alt={current.alt} fill unoptimized={unoptimized} sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          {photos.length > 1 && (
            <div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between">
              <IconButton label={labels.previous} icon={<ChevronLeft />} variant="secondary" onClick={() => go(index - 1)} className="bg-surface/90" />
              <IconButton label={labels.next} icon={<ChevronRight />} variant="secondary" onClick={() => go(index + 1)} className="bg-surface/90" />
            </div>
          )}
        </div>
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 type-caption text-fg-muted">
          <span>{current.caption ?? ""}</span>
          {photos.length > 1 ? <span aria-live="polite">{labels.position(index + 1, photos.length)}</span> : null}
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={labels.position(i + 1, photos.length)}
                  aria-current={i === index ? "true" : undefined}
                  className={cn(
                    "relative block size-14 overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:size-16",
                    i === index ? "border-accent" : "border-transparent opacity-80 hover:opacity-100",
                  )}
                >
                  <Image src={p.src} alt="" fill unoptimized={unoptimized} sizes="64px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
          <p className="sr-only">{labels.hint}</p>
        </>
      )}
    </section>
  );
}
