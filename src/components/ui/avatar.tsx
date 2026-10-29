import { cn, initials } from "@/lib/utils";
import { AvatarImage } from "./avatar-image";

type AvatarProps = {
  src?: string | null;
  /** Nome usado no alt e nas iniciais quando não há foto. */
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
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

/** Iniciais do nome sobre a cor sólida do avatar (sem foto). */
export function AvatarInitials({ name, label }: { name?: string | null; label?: string }) {
  return (
    <span aria-label={label || undefined} role={label ? "img" : undefined} data-avatar-initials="">
      {initials(name)}
    </span>
  );
}

// Avatar só com foto real (enviada ou oficial). Sem foto, ilustração antiga ou foto que não carrega:
// as iniciais do nome sobre uma cor sólida neutra do tema.
export function Avatar({ src, name, size = "md", className, alt }: AvatarProps) {
  const label = alt ?? name ?? "";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated font-bold uppercase text-fg-muted",
        sizes[size],
        className,
      )}
    >
      <AvatarImage src={src} alt={label} fallback={<AvatarInitials name={name} label={label} />} width={pixels[size]} height={pixels[size]} className="size-full object-cover" />
    </span>
  );
}
