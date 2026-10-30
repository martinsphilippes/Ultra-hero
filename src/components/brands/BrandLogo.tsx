import { cn } from "@/lib/utils";

type Props = { name: string; logoUrl: string | null; className?: string };

// Logo da marca (SVG do site em /brands ou imagem enviada pelo admin). Sem logo: o nome em texto.
// <img> simples: logo vem de domínios variados e o otimizador do Next só serve os buckets do app.
export function BrandLogo({ name, logoUrl, className }: Props) {
  if (!logoUrl) {
    return (
      <span className={cn("inline-flex h-6 items-center rounded-md bg-surface-hover px-2 text-xs font-bold tracking-wide text-fg", className)} aria-hidden="true">
        {name}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className={cn("h-6 w-auto max-w-[110px] rounded-md object-contain", className)} />
  );
}
