"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { toggleChecklistAction } from "@/lib/hero-work/actions";
import { checklistProgress, toggleChecklist } from "@/lib/hero-work/agenda";
import type { ChecklistItem } from "@/lib/hero-work/vocab";

type Props = { eventId: string; items: ChecklistItem[]; /** O titular marca; a equipe só consulta. */ canToggle: boolean };

// "O que preciso executar": checklist simples do compromisso. O titular marca na hora (otimista; volta se o
// servidor recusar); membro da equipe vê a lista sem poder marcar.
export function HeroChecklist({ eventId, items, canToggle }: Props) {
  const t = useTranslations("heroWork.agenda");
  const { toast } = useToast();
  const [list, setList] = useState(items);
  const [seen, setSeen] = useState(items);
  const [pending, start] = useTransition();
  // lista nova vinda do servidor (edição, outro dia): ressincroniza
  if (seen !== items) {
    setSeen(items);
    setList(items);
  }
  if (list.length === 0) return null;
  const progress = checklistProgress(list);

  function toggle(index: number) {
    const before = list;
    setList(toggleChecklist(list, index));
    start(async () => {
      const result = await toggleChecklistAction({ id: eventId, index });
      if (!result.ok) {
        setList(before);
        toast({ title: result.error, variant: "error" });
      }
    });
  }

  return (
    <div className="mt-1 flex w-full flex-col gap-1 rounded-xl bg-surface-elevated p-2.5" data-testid="hero-checklist">
      <p className="type-caption font-semibold text-fg-muted">
        {t("checklist")} · {t("checklistProgress", { done: progress.done, total: progress.total })}
      </p>
      <ul className="flex flex-col">
        {list.map((item, i) => (
          <li key={`${i}-${item.text}`}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm has-[:disabled]:cursor-default">
              <input
                type="checkbox"
                checked={item.done}
                disabled={!canToggle || pending}
                onChange={() => toggle(i)}
                className="size-5 shrink-0 accent-[var(--uh-accent,currentColor)]"
                data-testid="hero-checklist-item"
              />
              <span className={item.done ? "text-fg-muted line-through" : "text-fg"}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
