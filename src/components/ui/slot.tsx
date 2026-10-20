import { Children, cloneElement, isValidElement, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SlotProps = HTMLAttributes<HTMLElement> & { children?: ReactNode };

// Repassa as props para o único filho (padrão `asChild`), mesclando className e handlers.
export function Slot({ children, ...slotProps }: SlotProps) {
  const child = Children.only(children);
  if (!isValidElement<Record<string, unknown>>(child)) return null;

  const childProps = child.props;
  const merged: Record<string, unknown> = { ...slotProps, ...childProps };

  for (const key of Object.keys(slotProps)) {
    const slotValue = (slotProps as Record<string, unknown>)[key];
    const childValue = childProps[key];
    if (/^on[A-Z]/.test(key) && typeof slotValue === "function" && typeof childValue === "function") {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => void)(...args);
        (slotValue as (...a: unknown[]) => void)(...args);
      };
    } else if (key === "className") {
      merged.className = cn(slotValue as string, childValue as string);
    } else if (key === "style" && slotValue && childValue) {
      merged.style = { ...(slotValue as object), ...(childValue as object) };
    }
  }

  return cloneElement(child, merged);
}
