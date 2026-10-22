"use client";

import type { ComponentProps, FormEvent } from "react";

type Props = Omit<ComponentProps<"form">, "action" | "method" | "onSubmit"> & {
  action: string;
  /** Valores que não vão para a URL (o padrão de cada campo, ex.: ordem=relevance). */
  defaults?: Record<string, string>;
};

// Formulário GET do catálogo: sem JavaScript, o navegador envia como sempre; com JavaScript, monta
// a URL sem campos vazios nem valores padrão (endereço limpo e compartilhável) e fecha o painel de
// filtros. A navegação é a do navegador: na mesma rota com outros parâmetros, o router.push do Next
// abortava a busca do payload na biblioteca do chef e a tela não mudava.
export function GetForm({ action, defaults = {}, children, ...props }: Props) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const sp = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value !== "string") continue;
      const v = value.trim();
      if (!v || defaults[key] === v) continue;
      sp.append(key, v);
    }
    form.closest("details")?.removeAttribute("open");
    const qs = sp.toString();
    window.location.assign(qs ? `${action}?${qs}` : action);
  }

  return (
    <form action={action} method="get" onSubmit={onSubmit} {...props}>
      {children}
    </form>
  );
}
