"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "error" | "info";

export type ToastInput = {
  title: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** ms; 0 mantém até fechar manualmente. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Hook: const { toast } = useToast(); toast({ title: "Salvo", variant: "success" })
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fora do provider não quebra a UI; só não exibe nada.
    return { toast: () => -1, dismiss: () => {} };
  }
  return ctx;
}

const icons: Record<ToastVariant, ReactNode> = {
  default: null,
  success: <CircleCheck className="size-5 text-success" />,
  error: <CircleAlert className="size-5 text-danger" />,
  info: <Info className="size-5 text-info" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++counter.current;
    setItems((prev) => [...prev.slice(-3), { ...input, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  const t = useTranslations("common");
  return (
    <section
      aria-label={t("a11y.notifications")}
      className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom)+0.75rem)] z-50 flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
    >
      {/* Região polida: leitores de tela anunciam cada novo toast */}
      <div aria-live="polite" aria-atomic="false" className="contents">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={onDismiss} closeLabel={t("actions.close")} />
        ))}
      </div>
    </section>
  );
}

function ToastCard({ item, onDismiss, closeLabel }: { item: ToastItem; onDismiss: (id: number) => void; closeLabel: string }) {
  const duration = item.duration ?? (item.variant === "error" ? 7000 : 4500);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, item.id, onDismiss]);

  return (
    <div
      role={item.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface-elevated p-3.5 text-fg shadow-lg animate-slide-up",
        item.variant === "success" && "border-success/30",
        item.variant === "error" && "border-danger/30",
        item.variant === "info" && "border-info/30",
      )}
    >
      {icons[item.variant ?? "default"] && <span aria-hidden="true" className="mt-0.5 shrink-0">{icons[item.variant ?? "default"]}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold">{item.title}</p>
        {item.description && <p className="type-body-sm text-fg-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={closeLabel}
        className="-mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
