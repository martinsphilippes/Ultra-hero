"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button, IconButton, Input } from "@/components/ui";

export type AttributeRow = { id: number; key: string; value: string };

// Converte o jsonb de atributos em linhas editáveis (valores viram texto; listas viram "a, b").
export function attributesToRows(attributes: Record<string, unknown>): AttributeRow[] {
  return Object.entries(attributes ?? {}).map(([key, value], index) => ({
    id: index + 1,
    key,
    value: Array.isArray(value) ? value.map(String).join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""),
  }));
}

// Linhas -> objeto: número, booleano, lista (vírgulas) ou texto. Chaves vazias são ignoradas.
export function rowsToAttributes(rows: AttributeRow[]): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const raw = row.value.trim();
    if (!key) continue;
    if (raw === "") {
      out[key] = "";
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) out[key] = Number(raw);
    else if (/^(true|false)$/i.test(raw)) out[key] = raw.toLowerCase() === "true";
    else if (raw.includes(",")) out[key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    else out[key] = raw;
  }
  return out;
}

type Props = {
  rows: AttributeRow[];
  onChange: (rows: AttributeRow[]) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
};

// Editor simples de pares chave/valor (peso, volume, tamanhos…).
export function AttributesEditor({ rows, onChange, errors, disabled }: Props) {
  const t = useTranslations("commerce.productForm.fields");
  const te = useTranslations("commerce.productForm.errors");
  const baseId = useId();
  const [counter, setCounter] = useState(() => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1);

  function update(id: number, patch: Partial<AttributeRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const error = errors?.[`attributes.${row.key}`];
            return (
              <li key={row.id} className="flex flex-col gap-1">
                <div className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
                  <label htmlFor={`${baseId}-k-${row.id}`} className="sr-only">
                    {t("attributeKey")}
                  </label>
                  <Input
                    id={`${baseId}-k-${row.id}`}
                    value={row.key}
                    onChange={(e) => update(row.id, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32) })}
                    placeholder={t("attributeKey")}
                    inputSize="sm"
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    autoComplete="off"
                  />
                  <label htmlFor={`${baseId}-v-${row.id}`} className="sr-only">
                    {t("attributeValue")}
                  </label>
                  <Input id={`${baseId}-v-${row.id}`} value={row.value} onChange={(e) => update(row.id, { value: e.target.value.slice(0, 200) })} placeholder={t("attributeValue")} inputSize="sm" disabled={disabled} autoComplete="off" />
                  <IconButton label={t("removeAttribute", { key: row.key || "—" })} icon={<Trash2 />} size="sm" onClick={() => onChange(rows.filter((r) => r.id !== row.id))} disabled={disabled} />
                </div>
                {error ? (
                  <p role="alert" className="type-caption font-medium text-danger">
                    {te.has(error) ? te(error) : error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<Plus />}
        className="w-fit"
        disabled={disabled || rows.length >= 20}
        onClick={() => {
          onChange([...rows, { id: counter, key: "", value: "" }]);
          setCounter((c) => c + 1);
        }}
      >
        {t("addAttribute")}
      </Button>
    </div>
  );
}
