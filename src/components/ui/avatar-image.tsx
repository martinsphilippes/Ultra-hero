"use client";

import Image from "next/image";
import { useState } from "react";
import { safeAvatarSrc, storedAvatarPath, supabaseBaseUrl } from "@/lib/avatar/paths";

type Props = {
  src: string;
  alt: string;
  /** Ilustração local usada quando a foto não carrega (apagada, URL quebrada, rede). */
  fallbackSrc: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
};

// Só passa pelo otimizador o que remotePatterns aceita (fotos do bucket avatars no *.supabase.co);
// SVG local e foto do bucket fora do *.supabase.co (Supabase local) vão sem otimizar.
function optimizable(src: string): boolean {
  if (src.endsWith(".svg")) return false;
  if (src.startsWith("/")) return true;
  if (!storedAvatarPath(src, supabaseBaseUrl())) return false;
  try {
    return new URL(src).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

// Imagem de avatar com troca para a ilustração se a foto falhar (a foto pode ser removida entre a
// renderização em cache e o carregamento). Client component por causa do onError.
// URL de outro host nunca chega ao navegador (safeAvatarSrc): vira a ilustração direto.
export function AvatarImage({ src, alt, fallbackSrc, fill, width, height, sizes, priority, className }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safe = safeAvatarSrc(src, fallbackSrc, supabaseBaseUrl());
  const current = failedSrc === safe ? fallbackSrc : safe;
  return (
    <Image
      key={current}
      src={current}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      priority={priority}
      unoptimized={!optimizable(current)}
      className={className}
      onError={() => {
        if (current !== fallbackSrc) setFailedSrc(safe);
      }}
    />
  );
}
