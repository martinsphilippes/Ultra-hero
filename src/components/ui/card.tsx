import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Slot } from "./slot";

type CardProps = ComponentProps<"div"> & {
  /** Eleva no hover e mostra borda em acento (para cards clicáveis). */
  interactive?: boolean;
  /** Canto superior direito em degraus (eco da marca). */
  stepped?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  asChild?: boolean;
};

const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

// Superfície base. Combine com CardImage / CardBody / CardTitle / CardFooter.
export function Card({ className, interactive = false, stepped = false, padding = "none", asChild = false, ...props }: CardProps) {
  const classes = cn(
    "group/card relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-fg shadow-sm",
    "transition-[transform,box-shadow,border-color] duration-200 ease-out-expo",
    interactive &&
      "cursor-pointer hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-0",
    stepped && "clip-step",
    paddings[padding],
    className,
  );
  if (asChild) return <Slot className={classes} {...props} />;
  return <div className={classes} {...props} />;
}

type CardImageProps = {
  src: string;
  alt: string;
  ratio?: "video" | "square" | "portrait" | "wide";
  /** Conteúdo sobreposto à imagem (badges, play…). */
  overlay?: ReactNode;
  priority?: boolean;
  sizes?: string;
  className?: string;
};

const ratios = { video: "aspect-video", square: "aspect-square", portrait: "aspect-[3/4]", wide: "aspect-[21/9]" };

// Slot de imagem com zoom sutil no hover do card. SVG local vai sem otimização.
export function CardImage({ src, alt, ratio = "video", overlay, priority, sizes, className }: CardImageProps) {
  const isSvg = src.endsWith(".svg");
  return (
    <div className={cn("relative w-full overflow-hidden bg-surface-elevated", ratios[ratio], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        unoptimized={isSvg}
        sizes={sizes ?? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
        className="object-cover transition-transform duration-500 ease-out-expo group-hover/card:scale-[1.04]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian/60 via-transparent to-transparent" />
      {overlay && <div className="absolute inset-0 flex flex-col justify-between p-3">{overlay}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-1 flex-col gap-1.5 p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("type-h3 line-clamp-2 text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("type-body-sm line-clamp-2 text-fg-muted", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-3 border-t border-border px-4 py-3", className)} {...props} />;
}
