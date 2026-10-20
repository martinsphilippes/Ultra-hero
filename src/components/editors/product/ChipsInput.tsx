"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { Button, Input } from "@/components/ui";

type Props = {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Rótulo acessível do campo de digitação. */
  label: string;
  maxItems?: number;
  maxLength?: number;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

// Lista de chips editável: Enter/vírgula adiciona, botão remove. Usada em ingredientes/alérgenos.
export function ChipsInput({ id: idProp, values, onChange, label, maxItems = 50, maxLength = 80, disabled, ...aria }: Props) {
  const t = useTranslations("commerce.productForm.fields");
  const generated = useId();
  const id = idProp ?? `chips-${generated}`;
  const [draft, setDraft] = useState("");

  function add() {
    const items = draft
      .split(",")
      .map((s) => s.trim().slice(0, maxLength))
      .filter(Boolean);
    if (items.length === 0) return;
    const next = Array.from(new Set([...values, ...items])).slice(0, maxItems);
    onChange(next);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((item) => (
            <li key={item} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border-strong bg-surface-elevated pl-3 pr-1 text-sm text-fg">
              {item}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== item))}
                disabled={disabled}
                aria-label={t("chipRemove", { item })}
                className="inline-flex size-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={t("chipPlaceholder")}
          aria-label={label}
          disabled={disabled || values.length >= maxItems}
          maxLength={maxLength * 4}
          inputSize="sm"
          autoComplete="off"
          {...aria}
        />
        <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} onClick={add} disabled={disabled || draft.trim() === ""}>
          {t("chipAdd")}
        </Button>
      </div>
    </div>
  );
}
