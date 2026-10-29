import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

type FormFieldProps = {
  label: ReactNode;
  /** Mensagem de erro (quando presente, marca o campo como inválido). */
  error?: ReactNode;
  /** Dica exibida abaixo do campo. */
  hint?: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  /** O controle (Input, Textarea, Select…). Recebe id, aria-describedby e aria-invalid. */
  children: ReactElement<Record<string, unknown>>;
  className?: string;
  id?: string;
};

// Conecta rótulo, dica e erro ao controle via id/aria-describedby.
export function FormField({ label, error, hint, required, optionalLabel, children, className, id: idProp }: FormFieldProps) {
  const generated = useId();
  const id = idProp ?? `field-${generated}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // mantém uma descrição que o próprio controle já traga (ex.: dica mostrada fora do campo)
  const own = isValidElement(children) ? (children.props["aria-describedby"] as string | undefined) : undefined;
  const describedBy = [own ?? null, hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required: required || (children.props.required as boolean | undefined),
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} required={required} hint={!required ? optionalLabel : undefined}>
        {label}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="type-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
