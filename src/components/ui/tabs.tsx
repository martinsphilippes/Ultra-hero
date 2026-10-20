"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type TabsVariant = "underline" | "pill";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
  variant: TabsVariant;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`${component} precisa estar dentro de <Tabs>`);
  return ctx;
}

type TabsProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: TabsVariant;
  children: ReactNode;
  className?: string;
};

// Abas acessíveis (WAI-ARIA tabs) com tabindex itinerante e ativação automática.
export function Tabs({ value, defaultValue, onValueChange, variant = "underline", children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;
  const baseId = useId();

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) setInternal(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId, variant }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

type TabsListProps = ComponentProps<"div"> & { "aria-label": string };

export function TabsList({ className, onKeyDown, ...props }: TabsListProps) {
  const { variant } = useTabsContext("TabsList");

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    tabs[next].focus();
    tabs[next].click();
  };

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        "flex gap-1 overflow-x-auto scrollbar-none",
        variant === "underline" && "border-b border-border",
        variant === "pill" && "rounded-xl bg-surface-elevated p-1",
        className,
      )}
      {...props}
    />
  );
}

type TabProps = Omit<ComponentProps<"button">, "value"> & { value: string; icon?: ReactNode };

export function Tab({ value, icon, className, children, onClick, ...props }: TabProps) {
  const ctx = useTabsContext("Tab");
  const selected = ctx.value === value;
  const underline = ctx.variant === "underline";

  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={(event) => {
        onClick?.(event);
        ctx.setValue(value);
      }}
      className={cn(
        "relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
        underline
          ? cn(
              "rounded-t-md text-fg-muted hover:text-fg",
              selected && "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent",
            )
          : cn("min-h-9 flex-1 justify-center rounded-lg text-fg-muted", selected && "bg-surface text-fg shadow-sm"),
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className="[&_svg]:size-4">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

type TabPanelProps = ComponentProps<"div"> & {
  value: string;
  /** Mantém montado (oculto) quando inativo. */
  keepMounted?: boolean;
};

export function TabPanel({ value, keepMounted = false, className, children, ...props }: TabPanelProps) {
  const ctx = useTabsContext("TabPanel");
  const selected = ctx.value === value;
  if (!selected && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      hidden={!selected}
      tabIndex={0}
      className={cn("rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", className)}
      {...props}
    >
      {children}
    </div>
  );
}
