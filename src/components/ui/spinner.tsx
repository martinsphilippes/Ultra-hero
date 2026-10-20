import { cn } from "@/lib/utils";
import { VisuallyHidden } from "./visually-hidden";

type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
};

const sizes = { sm: "size-4", md: "size-6", lg: "size-10" };

// Indicador de carregamento acessível (role=status + rótulo oculto).
export function Spinner({ size = "md", label = "Carregando", className }: SpinnerProps) {
  return (
    <span role="status" className={cn("inline-flex items-center justify-center", className)}>
      <svg className={cn("animate-spin text-current", sizes[size])} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
