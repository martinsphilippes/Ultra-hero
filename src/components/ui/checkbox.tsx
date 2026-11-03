import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "size"> & {
  label?: ReactNode;
  description?: ReactNode;
};

// Checkbox nativo estilizado (teclado/leitores de tela de graça), toque mínimo 44px.
// Bloco 9: a área de 44px inteira marca (antes só o quadrinho de 20px reagia quando não havia rótulo); com rótulo,
// a linha toda é tocável (mín. 44px) e o estado desabilitado fica visível também no texto (esmaecido, cursor
// "proibido"), não só no quadrinho.
export function Checkbox({ className, label, description, id, ...props }: CheckboxProps) {
  const box = (
    <>
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
    </>
  );

  // sem rótulo visível: o próprio quadrado de 44px é um <label> (o nome acessível segue vindo do aria-label)
  if (!label) {
    return (
      <label htmlFor={id} className="relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center has-[:disabled]:cursor-not-allowed">
        {box}
      </label>
    );
  }

  return (
    <label htmlFor={id} className="group flex min-h-11 cursor-pointer items-start gap-1 text-sm text-fg has-[:disabled]:cursor-not-allowed">
      <span className="relative inline-flex size-11 shrink-0 items-center justify-center">{box}</span>
      <span className="flex min-h-11 flex-col justify-center group-has-[:disabled]:opacity-60">
        <span className="font-medium">{label}</span>
        {description && <span className="type-caption text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}
