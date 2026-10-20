import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonBase, buttonVariants, type ButtonVariant } from "./button";
import { Spinner } from "./spinner";

type IconButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** Rótulo acessível obrigatório (o ícone sozinho não comunica). */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  /** Com `asChild`, passe o elemento alvo (ex.: <Link href="/x" />) em `children`. */
  asChild?: boolean;
  children?: ReactElement<Record<string, unknown>>;
  /** Mostra uma bolinha de notificação. */
  dot?: boolean;
};

const sizes = {
  sm: "size-9 min-h-9 min-w-9 rounded-md [&_svg]:size-4",
  md: "size-11 min-h-11 min-w-11 rounded-lg [&_svg]:size-5",
  lg: "size-12 min-h-12 min-w-12 rounded-xl [&_svg]:size-6",
};

// Botão só com ícone; área de toque mínima de 44px no tamanho md.
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  asChild = false,
  dot = false,
  className,
  disabled,
  type,
  children,
  ...props
}: IconButtonProps) {
  const classes = cn(buttonBase, buttonVariants[variant], sizes[size], "relative p-0", className);
  const content = (
    <>
      {loading ? <Spinner size="sm" label={label} /> : <span aria-hidden="true">{icon}</span>}
      {dot && <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-accent" />}
    </>
  );

  if (asChild && isValidElement(children)) {
    return cloneElement(
      children,
      {
        ...props,
        className: cn(classes, children.props.className as string | undefined),
        "aria-label": label,
        title: label,
      },
      content,
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </button>
  );
}
