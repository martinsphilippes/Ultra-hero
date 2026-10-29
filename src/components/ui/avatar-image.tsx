"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { safeAvatarSrc, storedAvatarPath, supabaseBaseUrl } from "@/lib/avatar/paths";

type Props = {
  src: string | null | undefined;
  alt: string;
  /** O que aparece sem foto ou quando a foto não carrega (apagada, URL quebrada, rede): as iniciais. */
  fallback: ReactNode;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
};

// Só passa pelo otimizador o que remotePatterns aceita (fotos do bucket avatars no *.supabase.co) e
// as fotos locais; foto do bucket fora do *.supabase.co (Supabase local) vai sem otimizar.
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

// Foto de avatar com troca para as iniciais se não houver foto ou se ela falhar (a foto pode ser
// removida entre a renderização em cache e o carregamento). Client component por causa do onError.
// Ilustração antiga e URL de outro host nunca chegam ao navegador (safeAvatarSrc): viram as iniciais.
export function AvatarImage({ src, alt, fallback, fill, width, height, sizes, priority, className }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safe = safeAvatarSrc(src, supabaseBaseUrl());
  if (!safe || failedSrc === safe) return <>{fallback}</>;
  return (
    <Image
      key={safe}
      src={safe}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      priority={priority}
      unoptimized={!optimizable(safe)}
      className={className}
      onError={() => setFailedSrc(safe)}
    />
  );
}
