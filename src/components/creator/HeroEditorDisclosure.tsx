"use client";

import { Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

// "Editar perfil" no topo do /profile, como no Instagram (todas as contas; o herói tem também o perfil
// público): o editor completo fica recolhido logo abaixo do botão, na mesma tela. Abre pelo botão, pelo endereço /profile#perfil-publico (o
// antigo /creator/profile redireciona para lá), pelo atalho em Dados e sozinho quando um formulário
// de dentro mostra erro (erro escondido ninguém corrige).

/** Âncora do topo do herói (cabeçalho público); o endereço com ela abre o editor. */
export const HERO_ANCHOR = "perfil-publico";
/** Região recolhível do editor (aria-controls do botão). */
export const HERO_EDITOR_ID = "editar-perfil";
/** Parte "Sua conta" dentro do editor (antes a seção Dados); o endereço com ela também abre o editor. */
export const ACCOUNT_ANCHOR = "dados";
const OPEN_EVENT = "hero-editor:open";

type EditorApi = { reveal: () => void };
const EditorContext = createContext<EditorApi | null>(null);

/** Formulários de dentro do editor: abre a região (sem mexer no foco) quando há erro para mostrar. */
export function useRevealHeroEditor(): () => void {
  const api = useContext(EditorContext);
  return api?.reveal ?? noop;
}
function noop() {}

/** Abre o editor de outro ponto da página e leva o foco até o título dele. */
export function openHeroEditor() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Props = {
  /** Página pública: só com o perfil ativo. */
  publicHref: string | null;
  /** Texto abaixo do título do editor (o padrão fala da página pública do herói). */
  description?: string;
  children: ReactNode;
};

export function HeroEditorDisclosure({ publicHref, description, children }: Props) {
  const t = useTranslations("creator.profile");
  const [open, setOpen] = useState(false);
  // para onde o foco vai depois de abrir/fechar (efeito roda com a região já visível ou escondida)
  const [focusTo, setFocusTo] = useState<"title" | "title-far" | "toggle" | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const regionRef = useRef<HTMLElement>(null);

  // de longe (endereço, atalho em Dados) o editor sobe para o topo da tela; pelo botão, rolagem mínima
  const openWithFocus = useCallback((far: boolean) => {
    setOpen(true);
    setFocusTo(far ? "title-far" : "title");
  }, []);

  useEffect(() => {
    if (!focusTo) return;
    setFocusTo(null);
    if (focusTo === "toggle") {
      toggleRef.current?.focus();
      return;
    }
    titleRef.current?.focus({ preventScroll: focusTo === "title-far" });
    if (focusTo === "title-far") regionRef.current?.scrollIntoView({ block: "start" });
  }, [focusTo, open]);

  // endereço com a âncora do herói (ou do editor): abre sozinho; atalho de Dados: evento na janela
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === HERO_ANCHOR || hash === HERO_EDITOR_ID || hash === ACCOUNT_ANCHOR) openWithFocus(true);
    };
    const fromShortcut = () => openWithFocus(true);
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener(OPEN_EVENT, fromShortcut);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener(OPEN_EVENT, fromShortcut);
    };
  }, [openWithFocus]);

  const close = () => {
    setOpen(false);
    setFocusTo("toggle");
  };
  const api = useMemo<EditorApi>(() => ({ reveal: () => setOpen(true) }), []);

  return (
    <div className="flex flex-col gap-4">
      {/* dois botões lado a lado também no celular; o texto quebra em vez de vazar */}
      <div className={publicHref ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
        <Button
          ref={toggleRef}
          type="button"
          variant="secondary"
          aria-expanded={open}
          aria-controls={HERO_EDITOR_ID}
          onClick={() => (open ? close() : openWithFocus(false))}
          leadingIcon={<Pencil />}
          className="h-auto min-h-11 whitespace-normal px-3 py-2 text-center leading-tight"
          data-testid="hero-edit-toggle"
        >
          {t("editProfile")}
        </Button>
        {publicHref ? (
          <Button asChild variant="secondary" className="h-auto min-h-11 whitespace-normal px-3 py-2 text-center leading-tight">
            <Link href={publicHref}>{t("viewPublic")}</Link>
          </Button>
        ) : null}
      </div>

      <section
        id={HERO_EDITOR_ID}
        ref={regionRef}
        aria-labelledby="hero-editor-title"
        hidden={!open}
        data-testid="hero-editor"
        className="flex scroll-mt-20 flex-col gap-5 rounded-2xl border border-accent/30 bg-surface-elevated p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="hero-editor-title" ref={titleRef} tabIndex={-1} className="type-h3 text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {t("editorTitle")}
            </h2>
            <p className="type-body-sm text-fg-muted">{description ?? t("editorDescription")}</p>
          </div>
          <Button type="button" variant="ghost" leadingIcon={<X />} onClick={close} className="shrink-0">
            {t("close")}
          </Button>
        </div>
        <EditorContext.Provider value={api}>{children}</EditorContext.Provider>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" leadingIcon={<X />} onClick={close}>
            {t("close")}
          </Button>
        </div>
      </section>
    </div>
  );
}
