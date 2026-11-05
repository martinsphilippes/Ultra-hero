"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  /** Funções da conta já traduzidas (Herói, Agência, Marca…). */
  roles: string[];
  settingsHref: string;
  labels: { open: string; settings: string; signout: string; role: string };
};

// Avatar do cabeçalho: abre um quadro curto com quem está logado (nome, e-mail e função) e os atalhos
// Configurações (engrenagem) e Sair. Fecha ao tocar fora, com Esc ou ao escolher um atalho.
export function AccountMenu({ name, email, avatarUrl, roles, settingsHref, labels }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid="header-account-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-1 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span aria-hidden="true" className="contents">
          <Avatar src={avatarUrl} name={name} size="sm" alt="" />
        </span>
        <span className="sr-only">{labels.open}</span>
        <span aria-hidden="true" className="hidden max-w-32 truncate text-sm font-semibold lg:inline">
          {name}
        </span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        data-testid="header-account-panel"
        className={cn(
          "absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-elevated p-4 text-fg shadow-lg",
        )}
      >
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} name={name} size="md" alt="" />
          <div className="min-w-0">
            <p className="truncate font-semibold" data-testid="account-name">
              {name}
            </p>
            {email && (
              <p className="truncate text-sm text-fg-muted" data-testid="account-email">
                {email}
              </p>
            )}
          </div>
        </div>

        {roles.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{labels.role}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="account-roles">
              {roles.map((r) => (
                <li key={r} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold text-accent-text">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2 border-t border-border pt-3">
          <Link
            href={settingsHref}
            data-testid="header-settings-link"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 flex-1 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Settings className="size-5" aria-hidden="true" />
            {labels.settings}
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-fg-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <LogOut className="size-5" aria-hidden="true" />
              {labels.signout}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
