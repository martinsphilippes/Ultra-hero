"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import "./collectibles.css";

type Props = { photos: string[]; title: string };

const unoptimized = (src: string) => !src.startsWith("/") || src.endsWith(".svg");

// Galeria grande: desliza com o dedo (scroll-snap) e miniaturas de 44px+ para pular de foto.
export function Gallery({ photos, title }: Props) {
  const t = useTranslations("collectibles.gallery");
  const list = photos.length > 0 ? photos : ["/collectibles/ball.svg"];
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function go(index: number) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="uh-collectible-gallery -mx-gutter flex overflow-x-auto md:mx-0 md:rounded-2xl"
        aria-label={t("label", { title })}
        role="region"
        tabIndex={0}
      >
        {list.map((src, index) => (
          <div key={`${src}-${index}`} className="relative aspect-square w-full shrink-0 bg-surface-elevated md:aspect-[4/3]">
            <Image
              src={src}
              alt={list.length > 1 ? t("photo", { n: index + 1, total: list.length }) : title}
              fill
              priority={index === 0}
              unoptimized={unoptimized(src)}
              sizes="(min-width: 768px) 40rem, 100vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {list.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label={t("thumbs")}>
          {list.map((src, index) => (
            <button
              key={`${src}-thumb-${index}`}
              type="button"
              onClick={() => go(index)}
              aria-label={t("photo", { n: index + 1, total: list.length })}
              aria-pressed={active === index}
              className={cn(
                "relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                active === index ? "border-accent" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={src} alt="" fill unoptimized={unoptimized(src)} sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
