"use client";

import { Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { createMeetingAction, setMeetingActionStatusAction } from "@/lib/creator-meetings/actions";
import { cn } from "@/lib/utils";

// Ata de reunião (0138): botões pequenos da lista de reuniões, dos encaminhamentos e do guia.

/** "Nova ata": cria o rascunho (já com o que se sabe do Hero) e abre. */
export function NewMeetingButton({ talentId }: { talentId: string }) {
  const t = useTranslations("creatorMeetings.list");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      leadingIcon={<Plus />}
      disabled={pending}
      data-testid="meeting-new"
      onClick={() =>
        start(async () => {
          const res = await createMeetingAction(talentId);
          if (!res.ok) {
            toast({ title: res.error, variant: "error" });
            return;
          }
          router.push(`/agencia/casting/${talentId}/reunioes/${res.id}`);
        })
      }
    >
      {pending ? t("creating") : t("new")}
    </Button>
  );
}

/** Marca um encaminhamento como feito (some da lista de pendentes). */
export function ActionDoneButton({ actionId, talentId, meetingId }: { actionId: string; talentId: string; meetingId: string }) {
  const t = useTranslations("creatorMeetings.actionsPage");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      leadingIcon={<Check />}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setMeetingActionStatusAction({ actionId, talentId, meetingId, status: "done" });
          if (!res.ok) {
            toast({ title: res.error, variant: "error" });
            return;
          }
          toast({ title: t("doneToast"), variant: "success" });
          router.refresh();
        })
      }
    >
      {t("markDone")}
    </Button>
  );
}

/** "Antes de entrar": a pessoa toca em cada item do padrão de imagem e ambiente (fica só nesta tela). */
export function PrepChecklist({ items, readyLabel, label }: { items: { key: string; title: string; text: string }[]; readyLabel: string; label: string }) {
  const [done, setDone] = useState<string[]>([]);
  const all = done.length === items.length;
  return (
    <div className="flex flex-col gap-2">
      <ul className="grid gap-2 sm:grid-cols-2" aria-label={label} data-testid="guide-prep">
        {items.map((it) => {
          const on = done.includes(it.key);
          return (
            <li key={it.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setDone((d) => (on ? d.filter((k) => k !== it.key) : [...d, it.key]))}
                className={cn(
                  "flex h-full w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  on ? "border-success/50 bg-success/5" : "border-border bg-surface hover:bg-surface-hover",
                )}
              >
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm", on ? "bg-success text-white" : "border border-border-strong")}>
                  {on ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-fg">{it.title}</span>
                  <span className="type-caption text-fg-muted">{it.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {all ? (
        <p role="status" className="type-body-sm font-semibold text-success">
          {readyLabel}
        </p>
      ) : null}
    </div>
  );
}
