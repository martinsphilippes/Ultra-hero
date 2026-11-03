"use client";

import { useLayoutEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { caretForSignificant, intFromText, maskInt, significantBefore, typeInt } from "@/lib/numbers/int-input";
import { cn } from "@/lib/utils";
import { Input } from "./input";

type NumberInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "inputMode"> & {
  /** Valor controlado: texto ("10000", "10.000") ou número. O campo mostra com ponto de milhar. */
  value?: string | number | null;
  /** Valor inicial quando não controlado (útil em <form method="get"> e <form action>). */
  defaultValue?: string | number | null;
  /** Recebe o texto mascarado ("10.000") — aceito por parseIntText/parseCount/parseMetricInput — e o número (null = vazio). */
  onValueChange?: (text: string, value: number | null) => void;
  /** Máximo: dígitos que passariam disso são recusados enquanto digita. */
  max?: number;
  invalid?: boolean;
  inputSize?: "sm" | "md" | "lg";
};

/**
 * Campo de contagem inteira (seguidores, alcance, visualizações, curtidas, cliques, vendas): ponto de
 * milhar enquanto digita ("10000" → "10.000"); colar "10.000" ou "10000" dá o mesmo número.
 * Com `name`, o próprio input vai no FormData com o texto mascarado ("10.000"), que os parsers aceitam.
 * Não use para percentuais, decimais ou dinheiro (MoneyInput).
 */
export function NumberInput({ value, defaultValue, onValueChange, max, invalid, ref, className, ...props }: NumberInputProps) {
  const maxDigits = max !== undefined ? String(Math.trunc(max)).length : undefined;
  const [display, setDisplay] = useState(() => maskInt(value ?? defaultValue ?? "", maxDigits));
  const [seen, setSeen] = useState(value);
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  // valor controlado mudou de fora (reset do formulário, valor do servidor): ressincroniza
  if (value !== undefined && value !== seen) {
    setSeen(value);
    const masked = maskInt(value, maxDigits);
    if (intFromText(masked) !== intFromText(display)) setDisplay(masked);
  }

  useLayoutEffect(() => {
    const el = inner.current;
    if (el && caret.current !== null && document.activeElement === el) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [display]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    const pasted = inputType === "insertFromPaste" || inputType === "insertFromDrop";
    let next = typeInt(display, raw, { pasted, maxDigits });
    const n = intFromText(next);
    if (max !== undefined && n !== null && n > max) next = display;

    const pos = e.target.selectionStart ?? raw.length;
    caret.current = pos >= raw.length ? next.length : caretForSignificant(next, significantBefore(raw, pos));
    if (next === display) {
      // a máscara recusou ou não mudou nada (ex.: letra): devolve o texto e o cursor
      e.target.value = display;
      const c = Math.min(caret.current, display.length);
      e.target.setSelectionRange(c, c);
      caret.current = null;
      return;
    }
    setDisplay(next);
    onValueChange?.(next, intFromText(next));
  }

  return (
    <Input
      {...props}
      ref={(el: HTMLInputElement | null) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      invalid={invalid}
      className={cn("tabular-nums", className)}
    />
  );
}
