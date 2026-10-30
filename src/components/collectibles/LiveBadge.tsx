import { cn } from "@/lib/utils";
import "./collectibles.css";

type Props = { label: string; className?: string; size?: "sm" | "md" };

// Selo "AO VIVO" com o ponto pulsando (sem animação com prefers-reduced-motion).
export function LiveBadge({ label, className, size = "sm" }: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft font-mono font-semibold uppercase leading-none tracking-wider text-danger",
        size === "sm" ? "h-5 px-1.5 text-[0.625rem]" : "h-6 px-2 text-xs",
        className,
      )}
    >
      <span aria-hidden="true" className="uh-live-dot" />
      {label}
    </span>
  );
}
