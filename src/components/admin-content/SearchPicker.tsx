"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Badge, FormField, IconButton, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export type PickItem = { id: string; title: string; subtitle?: string | null; badge?: string | null };
export type PickResult = { ok: true; items: PickItem[] } | { ok: false; error: string };

type Props = {
  label: string;
  placeholder?: string;
  /** Server Action de busca (já filtra no servidor conforme a regra de cada tela). */
  search: (q: string) => Promise<PickResult>;
  value: PickItem | null;
  onChange: (item: PickItem | null) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
};

// Busca com debounce + lista de resultados selecionáveis (listbox acessível por teclado).
export function SearchPicker({ label, placeholder, search, value, onChange, hint, disabled, className }: Props) {
  const t = useTranslations("adminContent.common");
  const id = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setError(null);
      return;
    }
    const seq = ++latest.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await search(q);
        if (seq !== latest.current) return;
        if (result.ok) {
          setItems(result.items);
          setError(null);
        } else {
          setItems([]);
          setError(result.error);
        }
        setActive(-1);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const listId = `${id}-list`;
  const showList = query.trim().length >= 2 && !value;

  function choose(item: PickItem) {
    onChange(item);
    setQuery("");
    setItems([]);
  }

  if (value) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <span className="text-sm font-semibold text-fg">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{value.title}</p>
            {value.subtitle && <p className="truncate text-xs text-fg-muted">{value.subtitle}</p>}
          </div>
          <IconButton icon={<X />} label={t("change")} size="sm" onClick={() => onChange(null)} disabled={disabled} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      <FormField label={label} hint={hint ?? t("typeToSearch")} id={`${id}-input`}>
        <Input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (!showList || items.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + items.length) % items.length);
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder={placeholder}
          leadingIcon={<Search />}
          trailingIcon={pending ? <Spinner size="sm" label={t("searching")} /> : undefined}
          disabled={disabled}
          autoComplete="off"
        />
      </FormField>
      {showList && (
        <div className="rounded-lg border border-border bg-surface shadow-md">
          {error ? (
            <p role="alert" className="px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : items.length === 0 && !pending ? (
            <p className="px-3 py-2 text-sm text-fg-muted">{t("noMatches", { q: query.trim() })}</p>
          ) : (
            <ul id={listId} role="listbox" aria-label={label} className="max-h-64 divide-y divide-border overflow-y-auto">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active === index}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(item)}
                  className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm", active === index ? "bg-surface-hover" : "hover:bg-surface-hover")}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{item.title}</span>
                    {item.subtitle && <span className="block truncate text-xs text-fg-muted">{item.subtitle}</span>}
                  </span>
                  {item.badge && (
                    <Badge size="sm" variant="neutral">
                      {item.badge}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
