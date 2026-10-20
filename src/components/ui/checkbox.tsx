import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "size"> & {
  label?: ReactNode;
  description?: ReactNode;
};

// Checkbox nativo estilizado (teclado/leitores de tela de graça), toque mínimo 44px.
export function Checkbox({ className, label, description, id, ...props }: CheckboxProps) {
  const input = (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
      <input
        id={id}
        type="checkbox"
        className={cn(
          "peer size-5 appearance-none rounded-sm border border-border-strong bg-surface transition-colors",
          "checked:border-accent checked:bg-accent hover:border-fg-subtle disabled:cursor-not-allowed disabled:opacity-55",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute size-3.5 text-accent-fg opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );

  if (!label) return input;

  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-1 text-sm text-fg">
      {input}
      <span className="flex min-h-11 flex-col justify-center">
        <span className="font-medium">{label}</span>
        {description && <span className="type-caption text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}
