"use client";

import { useLayoutEffect, useRef, useState, type ChangeEvent, type ComponentProps, type FocusEvent } from "react";
import { brlToCents, editBrlFixed, finalizeBrl, maskBrl } from "@/lib/money/brl-input";
import { cn } from "@/lib/utils";
import { Input } from "./input";

type MoneyInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "inputMode"> & {
  /**
   * Valor controlado em reais, em qualquer formato que os parsers aceitam ("1500", "1.500,00",
   * "R$ 1.500,00", "1500,5"). O campo mostra mascarado; mudanças que mantêm os mesmos centavos
   * (ex.: "1.500" → "1.500,00") não mexem no que está sendo digitado.
   */
  value?: string;
  /** Valor inicial quando não controlado (texto em reais ou centavos). Útil em <form action>. */
  defaultValue?: string;
  /**
   * Recebe o texto mascarado sem "R$" ("50.000", "1.234,5", após o blur "50.000,00") — aceito por
   * parseBrlToCents, parseMoneyToCents, parsePriceToCents e parsePriceInput — e os centavos (null = vazio).
   */
  onValueChange?: (text: string, cents: number | null) => void;
  /** Mínimo em centavos: abaixo disso o campo fica inválido depois do blur. */
  minCents?: number;
  /** Máximo em centavos: dígitos que passariam disso são recusados enquanto digita. */
  maxCents?: number;
  invalid?: boolean;
  inputSize?: "sm" | "md" | "lg";
};

/** Texto que vai para fora: sem vírgula solta no fim (enviar com Enter antes do blur também parseia). */
const outward = (text: string) => text.replace(/,$/, "");

/**
 * Campo de valor em reais: "R$" cinza fixo à esquerda e o texto sempre completo ("R$ 50.000,00") enquanto digita.
 * O usuário digita reais ("50000" → "R$ 50.000,00"), com o cursor antes da vírgula; "," leva aos centavos.
 * Apagar tira dígitos dos reais, mesmo com o cursor no fim (editBrlFixed, pedido do responsável 04/11).
 * Com `name`, o próprio input vai no FormData com o texto mascarado (sem "R$"), que os parsers aceitam.
 */
export function MoneyInput({
  value,
  defaultValue,
  onValueChange,
  minCents,
  maxCents,
  invalid,
  onBlur,
  onFocus,
  ref,
  placeholder = "0,00",
  ...props
}: MoneyInputProps) {
  const initial = value ?? defaultValue ?? "";
  const [display, setDisplay] = useState(() => finalizeBrl(maskBrl(initial)));
  const [seen, setSeen] = useState(value);
  const [touched, setTouched] = useState(false);
  const focused = useRef(false);
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  // valor controlado mudou de fora (reset do formulário, valor vindo do servidor): ressincroniza
  if (value !== undefined && value !== seen) {
    setSeen(value);
    if (brlToCents(value) !== brlToCents(display)) {
      const masked = maskBrl(value);
      setDisplay(finalizeBrl(masked));
    }
  }

  useLayoutEffect(() => {
    const el = inner.current;
    if (el && caret.current !== null && document.activeElement === el) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [display]);

  function emit(next: string) {
    onValueChange?.(outward(next), brlToCents(next));
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    const pasted = inputType === "insertFromPaste" || inputType === "insertFromDrop";
    const pos = e.target.selectionStart ?? raw.length;
    let { text: next, caret: at } = editBrlFixed(display, raw, pos, { pasted });
    const cents = brlToCents(next);
    if (maxCents !== undefined && cents !== null && cents > maxCents) {
      next = display;
      at = display.indexOf(",") >= 0 ? display.indexOf(",") : display.length;
    }
    caret.current = at;
    if (next === display) {
      // nada mudou (letra, limite, só pulou o cursor): devolve o texto e põe o cursor no lugar certo
      e.target.value = display;
      const c = Math.min(at, display.length);
      e.target.setSelectionRange(c, c);
      caret.current = null;
      return;
    }
    setDisplay(next);
    emit(next);
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    focused.current = false;
    setTouched(true);
    const done = finalizeBrl(display);
    if (done !== display) {
      setDisplay(done);
      emit(done);
    }
    onBlur?.(e);
  }

  const cents = brlToCents(display);
  const belowMin = touched && minCents !== undefined && cents !== null && cents < minCents;

  return (
    <Input
      {...props}
      ref={(el: HTMLInputElement | null) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onFocus={(e) => {
        focused.current = true;
        // entrou no campo com o cursor no fim: leva para antes da vírgula (digitar entra nos reais)
        const el = e.currentTarget;
        requestAnimationFrame(() => {
          const c = el.value.indexOf(",");
          if (document.activeElement === el && c >= 0 && el.selectionStart === el.value.length && el.selectionEnd === el.value.length) el.setSelectionRange(c, c);
        });
        onFocus?.(e);
      }}
      onBlur={handleBlur}
      invalid={invalid || belowMin}
      aria-invalid={invalid || belowMin || props["aria-invalid"] || undefined}
      className={cn("tabular-nums", props.className)}
      leadingIcon={<span className="text-sm font-medium text-fg-subtle">R$</span>}
    />
  );
}
