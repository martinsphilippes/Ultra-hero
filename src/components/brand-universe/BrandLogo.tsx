import { brandInitials } from "@/lib/brand-universe/logo";
import { cn } from "@/lib/utils";

// Logo da marca num quadrado branco; sem logo, as iniciais (0131).
export function BrandLogo({ name, url, size = "md" }: { name: string; url: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-16 rounded-2xl" : size === "sm" ? "size-9 rounded-lg" : "size-11 rounded-xl";
  const img = size === "lg" ? "max-h-12 max-w-13" : size === "sm" ? "max-h-6 max-w-7" : "max-h-8 max-w-9";
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white", box)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className={cn("object-contain", img)} />
      ) : (
        <span className={cn("font-semibold text-neutral-600", size === "lg" ? "text-lg" : "text-xs")} aria-hidden="true">
          {brandInitials(name)}
        </span>
      )}
    </span>
  );
}
