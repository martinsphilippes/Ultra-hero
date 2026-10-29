import { cn } from "@/lib/utils";
import { BRAND_ORANGE, LOGO_A_PATH, LOGO_GROSCOVE_PATH, LOGO_ULTR_PATH, LOGO_VIEWBOX, MARK_VIEWBOX } from "./brand-paths";

export { BRAND_ORANGE };

/** Nome da marca, para textos alternativos e rótulos. */
export const BRAND_NAME = "Groscove Ultra";

type LogoMarkProps = {
  className?: string;
  /** Cor fixa da marca (padrão) ou herdada de currentColor. */
  monochrome?: boolean;
  title?: string;
};

// Símbolo: o "A" em triângulo laranja da logomarca Groscove Ultra.
export function LogoMark({ className, monochrome = false, title }: LogoMarkProps) {
  return (
    <svg viewBox={MARK_VIEWBOX} role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} className={cn("h-6 w-auto shrink-0", className)}>
      {title && <title>{title}</title>}
      <path d={LOGO_A_PATH} fill={monochrome ? "currentColor" : BRAND_ORANGE} />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** false: só o símbolo (triângulo). */
  withWordmark?: boolean;
  /** "brand": texto na cor do tema + triângulo laranja; "mono": tudo em currentColor (versões branca/preta). */
  variant?: "brand" | "mono";
};

const heights = { sm: "h-7", md: "h-9", lg: "h-14", xl: "h-20" };
const markHeights = { sm: "h-5", md: "h-6", lg: "h-9", xl: "h-12" };

// Logomarca completa: GROSCOVE em cima, ULTRA com o A em triângulo. O texto segue a cor do tema
// (preto no claro, branco no escuro) e o triângulo fica no laranja da marca.
export function Logo({ className, size = "md", withWordmark = true, variant = "brand" }: LogoProps) {
  if (!withWordmark) return <LogoMark className={cn(markHeights[size], className)} monochrome={variant === "mono"} />;
  return (
    <svg viewBox={LOGO_VIEWBOX} role="img" aria-label={BRAND_NAME} className={cn("w-auto shrink-0 text-fg", heights[size], className)} data-testid="brand-logo">
      <path d={LOGO_GROSCOVE_PATH} fill="currentColor" />
      <path d={LOGO_ULTR_PATH} fill="currentColor" />
      <path d={LOGO_A_PATH} fill={variant === "mono" ? "currentColor" : BRAND_ORANGE} />
    </svg>
  );
}
