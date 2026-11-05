"use client";

import { Plus, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MAX_CHECKS } from "@/lib/brief/brief";

/** id e aria-describedby vêm do FormField: o rótulo aponta para o 1º item (ou para "Adicionar item" com a lista vazia). */
type Props = { value: string; onChange: (next: string) => void; disabled?: boolean; id?: string; "aria-describedby"?: string };

// Itens extras do checklist como lista de verdade (pedido do responsável, 04/11): uma linha por item com a caixinha
// que o Hero e a marca vão marcar depois, "x" para remover e "Adicionar item". Enter cria o próximo item; apagar
// um item vazio volta para o anterior. O valor continua sendo texto com um item por linha (BriefDraft.checks),
// então salvar e validar seguem iguais (parseChecks no app, checks no banco).
export function ChecklistEditor({ value, onChange, disabled, id, "aria-describedby": describedBy }: Props) {
  const t = useTranslations("brief.fields");
  const [items, setItems] = useState<string[]>(() => (value ? value.split("\n") : []));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = useRef<number | null>(null);

  // valor trocado de fora (ex.: briefing recarregado) e diferente do que a lista mostra: reflete
  useEffect(() => {
    if (value !== items.join("\n")) setItems(value ? value.split("\n") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (focusAt.current !== null) {
      inputs.current[focusAt.current]?.focus();
      focusAt.current = null;
    }
  });

  const commit = (next: string[]) => {
    setItems(next);
    onChange(next.join("\n"));
  };
  const add = (at = items.length) => {
    if (items.length >= MAX_CHECKS) return;
    focusAt.current = at;
    commit([...items.slice(0, at), "", ...items.slice(at)]);
  };
  const remove = (i: number) => {
    focusAt.current = i > 0 ? i - 1 : items.length > 1 ? 0 : null;
    commit(items.filter((_, k) => k !== i));
  };
  const tooShort = items.some((x) => x.trim().length > 0 && x.trim().length < 3);

  return (
    <div className="flex flex-col gap-2" data-testid="brief-checklist-editor">
      {items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 pl-3">
              <Square className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                id={i === 0 ? id : undefined}
                aria-describedby={i === 0 ? describedBy : undefined}
                value={item}
                maxLength={120}
                disabled={disabled}
                placeholder={i === 0 ? t("checkPlaceholder") : undefined}
                aria-label={t("checkItem", { n: i + 1 })}
                onChange={(e) => commit(items.map((x, k) => (k === i ? e.target.value.replace(/\n/g, " ") : x)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (item.trim()) add(i + 1);
                  } else if (e.key === "Backspace" && item === "") {
                    e.preventDefault();
                    remove(i);
                  }
                }}
                className="min-h-12 min-w-0 flex-1 bg-transparent py-2 text-base text-fg outline-none placeholder:text-fg-subtle disabled:opacity-60 sm:text-sm"
                data-testid="brief-check-item"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label={t("checkRemove", { n: i + 1 })}
                className="flex size-11 shrink-0 items-center justify-center text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => add()} disabled={disabled || items.length >= MAX_CHECKS} id={items.length === 0 ? id : undefined} aria-describedby={items.length === 0 ? describedBy : undefined} data-testid="brief-check-add">
          {t("checkAdd")}
        </Button>
        {items.length > 0 ? <span className="type-caption text-fg-subtle">{t("checkCount", { count: items.length, max: MAX_CHECKS })}</span> : null}
      </div>
      {tooShort ? <p className="type-caption text-warning">{t("checkTooShort")}</p> : null}
    </div>
  );
}
