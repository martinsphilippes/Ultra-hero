import Image from "next/image";
import { cn, initials, stableHash } from "@/lib/utils";

type AvatarProps = {
  src?: string | null;
  /** Nome usado no alt e para escolher um placeholder estável. */
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Mostra iniciais em vez do placeholder abstrato quando não há imagem. */
  fallback?: "placeholder" | "initials";
  className?: string;
  /** Alt explícito; vazio quando o avatar é decorativo ao lado do nome. */
  alt?: string;
};

const sizes = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
};

const pixels = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

// Avatar com imagem (Supabase ou local) ou placeholder abstrato determinístico.
export function Avatar({ src, name, size = "md", fallback = "placeholder", className, alt }: AvatarProps) {
  const label = alt ?? name ?? "";
  const placeholder = `/placeholders/avatar-${(stableHash(name ?? "uh") % 8) + 1}.svg`;
  const source = src || (fallback === "placeholder" ? placeholder : null);
  const isSvg = source?.endsWith(".svg") ?? false;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated font-bold uppercase text-fg-muted",
        sizes[size],
        className,
      )}
    >
      {source ? (
        <Image
          src={source}
          alt={label}
          width={pixels[size]}
          height={pixels[size]}
          unoptimized={isSvg}
          className="size-full object-cover"
        />
      ) : (
        <span aria-label={label || undefined} role={label ? "img" : undefined}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
