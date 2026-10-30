"use client";

import { Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { coverFallback } from "@/components/discover/explore/tiles";
import type { Pillar } from "@/lib/supabase/helpers";

type Props = {
  /** cover_url do banco; vazio = sem capa. */
  src: string | null | undefined;
  pillar: Pillar;
  /** Vídeo: o substituto ganha o botão de play no centro (a capa dele é a miniatura do Stream). */
  video?: boolean;
  sizes: string;
  priority?: boolean;
  className?: string;
};

// Capa de quadro/post (grade do herói, Explorar, feed do Início). Sem capa, ou se a capa falha
// (miniatura do Stream fora do ar, arquivo apagado), mostra o placeholder da marca do pilar e, em
// vídeo, um play no centro: nunca um quadrado vazio. Client component por causa do onError.
export function CoverImage({ src, pillar, video, sizes, priority, className }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = !src || failedSrc === src;
  const shown = broken ? coverFallback(pillar) : src;

  return (
    <>
      <Image
        key={shown}
        src={shown}
        alt=""
        fill
        priority={priority}
        unoptimized={shown.endsWith(".svg")}
        sizes={sizes}
        className={className}
        data-cover-fallback={broken ? "" : undefined}
        onError={broken ? undefined : () => setFailedSrc(src)}
      />
      {broken && video ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/30 backdrop-blur-sm">
            <Play className="size-6 translate-x-px fill-current" />
          </span>
        </span>
      ) : null}
    </>
  );
}
