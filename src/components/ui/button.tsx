import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover active:translate-y-px disabled:hover:bg-accent",
  secondary:
    "bg-surface-elevated text-fg border border-border-strong hover:bg-surface-hover hover:border-fg-subtle active:translate-y-px",
  ghost: "bg-transparent text-fg hover:bg-surface-hover active:translate-y-px",
  danger: "bg-danger text-danger-fg hover:brightness-110 active:translate-y-px",
  link: "bg-transparent text-accent-text underline-offset-4 hover:underline px-0 min-h-0 min-w-0 rounded-sm",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 min-h-9 px-3 text-sm gap-1.5 rounded-(--uh-btn-radius-sm)",
  md: "h-11 min-h-11 px-4 text-sm gap-2 rounded-(--uh-btn-radius-md)",
  lg: "h-12 min-h-12 px-6 text-base gap-2 rounded-(--uh-btn-radius-lg)",
};

// uh-btn: gancho dos templates de Aparência (caixa, espaçamento de letras e raio vêm de tokens)
export const buttonBase =
  "uh-btn inline-flex items-center justify-center font-semibold [text-transform:var(--uh-btn-case)] tracking-(--uh-btn-tracking) whitespace-nowrap select-none transition-[background-color,border-color,transform,box-shadow,color] duration-150 disabled:opacity-55 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Renderiza as props no filho (ex.: <Link>) em vez de um <button>. */
  asChild?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Ocupa toda a largura disponível. */
  block?: boolean;
};

// Botão base do design system. `loading` mantém a largura e anuncia aria-busy.
export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  asChild = false,
  leadingIcon,
  trailingIcon,
  block = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(
    buttonBase,
    buttonVariants[variant],
    `uh-btn--${variant}`,
    variant === "link" ? "h-auto" : buttonSizes[size],
    block && "w-full",
    loading && "relative",
    className,
  );

  const leading = leadingIcon ? (
    <span aria-hidden="true" className="-ml-0.5 inline-flex shrink-0 [&>svg]:size-4">
      {leadingIcon}
    </span>
  ) : null;
  const trailing = trailingIcon ? (
    <span aria-hidden="true" className="-mr-0.5 inline-flex shrink-0 [&>svg]:size-4">
      {trailingIcon}
    </span>
  ) : null;

  // asChild: repassa classes/props ao filho (ex.: <Link>) e injeta os ícones dentro dele.
  if (asChild && isValidElement<Record<string, unknown>>(children)) {
    return cloneElement(
      children,
      {
        ...props,
        className: cn(classes, children.props.className as string | undefined),
        "aria-disabled": disabled || loading || undefined,
      },
      leading,
      children.props.children as ReactNode,
      trailing,
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" />
        </span>
      )}
      <span className={cn("inline-flex items-center justify-center gap-[inherit]", loading && "invisible")}>
        {leading}
        {children}
        {trailing}
      </span>
    </button>
  );
}
