"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
import { entityDetails, entityOptionLabel, type EntityOption } from "@/lib/ui/entity";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Select } from "./select";

export type { EntityOption };

type EntitySelectProps = Omit<ComponentProps<typeof Select>, "children" | "value" | "defaultValue"> & {
  options: EntityOption[];
  value?: string;
  defaultValue?: string;
  /** Opção vazia no topo ("Sem responsável", "Todos", "—"). Sem ela, não há opção vazia. */
  emptyLabel?: string;
  /** Cartão mostrado quando a opção vazia está escolhida (ex.: "Ninguém recebe os avisos"). */
  emptyCard?: ReactNode;
  /** Opções fixas sem cartão, depois da vazia (ex.: filtros "Meus", "Sem responsável"). */
  extraOptions?: Array<{ value: string; label: string }>;
  /** Mostra o papel entre parênteses na opção (padrão: sim). */
  roleInOption?: boolean;
  /** Classe do bloco (select + cartão). */
  wrapperClassName?: string;
  /** Busca pelo nome mesmo em lista curta (o padrão só mostra a partir de ENTITY_SEARCH_MIN opções). */
  searchAlways?: boolean;
};

/** Cartão compacto da entidade escolhida: avatar/inicial, nome legível e uma linha de detalhes. */
export function EntityCard({ option, className, id }: { option: EntityOption; className?: string; id?: string }) {
  const details = entityDetails([option.role, option.org, option.email, option.detail]);
  return (
    <div id={id} className={cn("flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface-elevated px-3 py-2", className)} data-testid="entity-card">
      <Avatar src={option.avatarUrl} name={option.name} size="sm" alt="" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">{option.name}</p>
        {details ? <p className="truncate text-xs text-fg-muted">{details}</p> : null}
      </div>
    </div>
  );
}

/** A partir de quantas opções a caixa ganha a busca pelo nome (lista grande, como o casting). */
export const ENTITY_SEARCH_MIN = 12;

/** Texto sem acento e em minúsculas, para a busca achar "joao" em "João". */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Opções cujo nome (ou detalhe) contém todas as palavras digitadas; no máximo `limit`. */
export function filterEntityOptions(options: EntityOption[], query: string, limit = 8): EntityOption[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return options
    .filter((o) => !o.disabled)
    .filter((o) => {
      const hay = searchKey([o.name, o.detail ?? "", o.org ?? ""].join(" "));
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

/**
 * Caixa de seleção de pessoa/login/entidade com o cartão de quem foi escolhido logo abaixo.
 * Use dentro de <FormField> (id e aria-describedby chegam ao <select>); a dica do FormField deve
 * explicar a caixa: o que é, quem aparece na lista e o que acontece ao escolher.
 * Funciona controlada (value + onChange) ou não controlada (defaultValue, em <form method="get">).
 */
export function EntitySelect({
  options,
  value,
  defaultValue,
  onChange,
  emptyLabel,
  emptyCard,
  extraOptions,
  roleInOption = true,
  wrapperClassName,
  searchAlways = false,
  id,
  ...props
}: EntitySelectProps) {
  const [own, setOwn] = useState(defaultValue ?? (emptyLabel !== undefined ? "" : (options[0]?.value ?? "")));
  const current = value ?? own;
  const chosen = options.find((o) => o.value === current) ?? null;
  const cardId = id ? `${id}-entity` : undefined;
  const groups = options.some((o) => o.group) ? Array.from(new Set(options.map((o) => o.group ?? ""))) : null;
  const renderOption = (o: EntityOption) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {entityOptionLabel(o.name, roleInOption ? o.role : null)}
    </option>
  );

  // lista grande (ex.: 261 Heroes do casting): busca pelo nome acima da caixa. Tocar num resultado escolhe a opção
  // no próprio <select> (dispara o "change" de verdade, então quem usa a caixa não muda nada).
  const tp = useTranslations("pickers.search");
  const selectRef = useRef<HTMLSelectElement>(null);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const searchable = (searchAlways ? options.length > 0 : options.length >= ENTITY_SEARCH_MIN) && !props.disabled;
  const results = searchable ? filterEntityOptions(options, query) : [];

  function pick(next: string) {
    const el = selectRef.current;
    setQuery("");
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    if (value === undefined) setOwn(e.target.value);
    onChange?.(e);
  }

  return (
    <div className={cn("flex flex-col gap-2", wrapperClassName)}>
      {searchable ? (
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tp("placeholder", { count: options.length })}
              aria-label={tp("label")}
              autoComplete="off"
              enterKeyHint="search"
              className="h-11 min-h-11 w-full rounded-xl border border-border bg-surface-elevated pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:text-sm"
              data-testid="entity-search"
            />
          </div>
          {query.trim() ? (
            results.length > 0 ? (
              <ul className="flex flex-col gap-1" aria-label={tp("results")} data-testid="entity-search-results">
                {results.map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => pick(o.value)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-1.5 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <Avatar src={o.avatarUrl} name={o.name} size="sm" alt="" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-fg">{o.name}</span>
                        {o.detail ? <span className="block truncate text-xs text-fg-muted">{o.detail}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 text-xs text-fg-muted" data-testid="entity-search-empty">
                {tp("empty")}
              </p>
            )
          ) : null}
        </div>
      ) : null}
      <Select {...props} ref={selectRef} id={id} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={handleChange}>
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {extraOptions?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups
          ? groups.map((g) => (
              <optgroup key={g} label={g}>
                {options.filter((o) => (o.group ?? "") === g).map(renderOption)}
              </optgroup>
            ))
          : options.map(renderOption)}
      </Select>
      <div aria-live="polite" className="empty:hidden">
        {chosen ? (
          <EntityCard option={chosen} id={cardId} />
        ) : current === "" && emptyCard ? (
          <p id={cardId} className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-fg-muted" data-testid="entity-card-empty">
            {emptyCard}
          </p>
        ) : null}
      </div>
    </div>
  );
}
