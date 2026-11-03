"use client";

import { useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
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

/**
 * Caixa de seleção de pessoa/login/entidade com o cartão de quem foi escolhido logo abaixo.
 * Use dentro de <FormField> (id e aria-describedby chegam ao <select>); a dica do FormField deve
 * explicar a caixa: o que é, quem aparece na lista e o que acontece ao escolher.
 * Funciona controlada (value + onChange) ou não controlada (defaultValue, em <form method="get">).
 */
export function EntitySelect({ options, value, defaultValue, onChange, emptyLabel, emptyCard, extraOptions, roleInOption = true, wrapperClassName, id, ...props }: EntitySelectProps) {
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

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    if (value === undefined) setOwn(e.target.value);
    onChange?.(e);
  }

  return (
    <div className={cn("flex flex-col gap-2", wrapperClassName)}>
      <Select {...props} id={id} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={handleChange}>
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
