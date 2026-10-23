"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconButton } from "@/components/ui";

type Props = {
  label: string;
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
};

// Menu de item (editar/excluir) sobre button + role=menu: Escape, setas e clique fora fecham/navegam.
export function ItemMenu({ label, editLabel, deleteLabel, onEdit, onDelete }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => first.current?.focus());
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      (root.current?.querySelector<HTMLElement>("[aria-haspopup]"))?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  }

  // O foco volta ao gatilho ANTES de abrir o diálogo: o menuitem some no mesmo commit e o diálogo
  // guardaria o <body> como lugar para devolver o foco ao fechar.
  function pick(action: () => void) {
    root.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    setOpen(false);
    action();
  }

  return (
    <div ref={root} className="relative shrink-0" onKeyDown={onKeyDown}>
      <IconButton label={label} icon={<MoreHorizontal />} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((v) => !v)} />
      {open ? (
        <div id={id} role="menu" aria-label={label} className="absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col rounded-lg border border-border bg-surface-elevated p-1 shadow-lg">
          <button
            ref={first}
            type="button"
            role="menuitem"
            onClick={() => pick(onEdit)}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {editLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onDelete)}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-danger hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {deleteLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
