"use client";

import Image from "next/image";
import { useState } from "react";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { safeCoverSrc, storedCoverPath } from "@/lib/hero-cover/paths";
import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  alt?: string;
  /** Proporção do quadro (o card usa 21:9; o editor, 16:9, a proporção gerada). */
  ratio: "wide" | "video";
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Zoom sutil no hover e sombra embaixo, como o CardImage do card. */
  card?: boolean;
};

const ratios = { wide: "aspect-[21/9]", video: "aspect-video" };

// Só passa pelo otimizador o que remotePatterns aceita (capas do bucket no *.supabase.co) e as fotos locais.
function optimizable(src: string): boolean {
  if (src.startsWith("/")) return !src.endsWith(".svg");
  if (!storedCoverPath(src, supabaseBaseUrl())) return false;
  try {
    return new URL(src).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

// Capa do herói: só foto real (oficial ou enviada). Sem capa, capa desenhada antiga, URL de outro
// host ou foto que não carrega: uma superfície lisa do tema, no mesmo tamanho (o layout não muda).
export function HeroCoverImage({ src, alt = "", ratio, priority, sizes, className, card = false }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safe = safeCoverSrc(src, supabaseBaseUrl());
  const show = safe !== null && failedSrc !== safe;
  return (
    // sem foto: um tom neutro do tema um pouco diferente do card, para a faixa não sumir no fundo
    <div className={cn("relative w-full overflow-hidden", show ? "bg-surface-elevated" : "bg-surface-hover", ratios[ratio], className)} data-testid={show ? "hero-cover-image" : "hero-cover-empty"}>
      {show && (
        <Image
          key={safe}
          src={safe}
          alt={alt}
          fill
          priority={priority}
          unoptimized={!optimizable(safe)}
          sizes={sizes ?? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
          className={cn("object-cover", card && "transition-transform duration-500 ease-out-expo group-hover/card:scale-[1.04]")}
          onError={() => setFailedSrc(safe)}
        />
      )}
      {show && card && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian/60 via-transparent to-transparent" />}
    </div>
  );
}
