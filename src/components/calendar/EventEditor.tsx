"use client";

import { CalendarPlus, ExternalLink, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { canManageEvent, eventToInput, newEventDefaults, type EditableEvent, type EventPermissions } from "@/lib/calendar/form";
import type { EventInput } from "@/lib/calendar/vocab";
import { EventDeleteButton } from "./EventDeleteButton";
import { EventFormDialog, type EventFormOptions } from "./EventForm";

// 0086 · Criar e editar compromisso manual pela agência, num só diálogo para a página inteira.
// O provider guarda o dia selecionado na grade (AgendaCalendar informa), abre o formulário novo já nesse dia
// (ou hoje, no fuso da agência) e abre o formulário de edição preenchido a partir da lista do dia. Quem pode
// editar/remover segue canManageEvent (a mesma regra das RPCs; o banco confere de novo). Fora do provider (marca,
// creator) nada disso aparece.

type EditorValue = {
  canCreate: boolean;
  canManage: (event: Pick<EditableEvent, "source" | "kind" | "dealId">) => boolean;
  openNew: (day?: string | null) => void;
  openEdit: (event: EditableEvent) => void;
  selectedDay: string | null;
  setSelectedDay: (day: string | null) => void;
};

const EditorContext = createContext<EditorValue | null>(null);

/** Editor da agenda, se a página tiver um (agência). */
export function useEventEditor(): EditorValue | null {
  return useContext(EditorContext);
}

type ProviderProps = {
  children: ReactNode;
  options: EventFormOptions;
  /** Fuso da agência: converte o evento salvo para data/hora do formulário. */
  timeZone: string;
  /** Hoje (YYYY-MM-DD) no fuso da agência, calculado no servidor. */
  today: string;
  /** Quem pode editar/remover (gestor+ e negócios abertos que a pessoa trabalha). */
  permissions: EventPermissions;
  /** Mostra "Novo compromisso" (staff sem negócio próprio não tem onde criar). */
  canCreate: boolean;
};

export function EventEditorProvider({ children, options, timeZone, today, permissions, canCreate }: ProviderProps) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<EventInput>(() => newEventDefaults(null, today, options.fixedDealId ?? null));
  // cada abertura remonta o formulário (estado limpo, valores iniciais novos)
  const [version, setVersion] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const openNew = useCallback(
    (day?: string | null) => {
      setInitial(newEventDefaults(day ?? selectedDay, today, options.fixedDealId ?? null));
      setVersion((n) => n + 1);
      setOpen(true);
    },
    [selectedDay, today, options.fixedDealId],
  );
  const openEdit = useCallback(
    (event: EditableEvent) => {
      setInitial(eventToInput(event, timeZone));
      setVersion((n) => n + 1);
      setOpen(true);
    },
    [timeZone],
  );
  const canManage = useCallback((event: Pick<EditableEvent, "source" | "kind" | "dealId">) => canManageEvent(event, permissions), [permissions]);
  const value = useMemo<EditorValue>(() => ({ canCreate, canManage, openNew, openEdit, selectedDay, setSelectedDay }), [canCreate, canManage, openNew, openEdit, selectedDay]);

  return (
    <EditorContext.Provider value={value}>
      {children}
      <EventFormDialog key={version} open={open} onOpenChange={setOpen} initial={initial} {...options} />
    </EditorContext.Provider>
  );
}

/** "Novo compromisso" do cabeçalho: abre no dia selecionado na grade (ou hoje). */
export function EventNewButton() {
  const t = useTranslations("agency.agenda.form");
  const editor = useEventEditor();
  if (!editor?.canCreate) return null;
  return (
    <Button type="button" size="sm" leadingIcon={<CalendarPlus />} onClick={() => editor.openNew()} data-testid="event-new">
      {t("new")}
    </Button>
  );
}

/** Atalho no cabeçalho da lista do dia: compromisso já nesse dia. */
export function EventNewOnDayButton({ day, dateLabel }: { day: string; dateLabel: string }) {
  const t = useTranslations("agency.agenda.form");
  const editor = useEventEditor();
  if (!editor?.canCreate) return null;
  return (
    <Button type="button" size="sm" variant="secondary" leadingIcon={<CalendarPlus />} onClick={() => editor.openNew(day)} aria-label={t("newOnDayLabel", { date: dateLabel })} data-testid="event-new-on-day">
      {t("newOnDay")}
    </Button>
  );
}

type ActionEvent = EditableEvent & { sponsorshipId: string | null };

/** Ações de um item da lista (agência): editar e remover os manuais que a pessoa pode mexer; patrocínio abre a oportunidade. */
export function EventActions({ event }: { event: ActionEvent }) {
  const t = useTranslations("agency.agenda");
  const editor = useEventEditor();
  if (event.kind === "sponsorship" && event.sponsorshipId) {
    // 0085: a oportunidade se edita na tela dela
    return (
      <Button asChild size="sm" variant="ghost" leadingIcon={<ExternalLink />}>
        <Link href={`/agencia/oportunidades/${event.sponsorshipId}`} aria-label={t("sponsorshipEditLabel", { title: event.title })} data-testid="event-open-sponsorship">
          <span className="sr-only sm:not-sr-only">{t("sponsorshipEdit")}</span>
        </Link>
      </Button>
    );
  }
  if (!editor?.canManage(event)) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button type="button" size="sm" variant="ghost" leadingIcon={<Pencil />} onClick={() => editor.openEdit(event)} aria-label={t("editLabel", { title: event.title })} data-testid="event-edit">
        <span className="sr-only sm:not-sr-only">{t("edit")}</span>
      </Button>
      <EventDeleteButton id={event.id} dealId={event.dealId} title={event.title} />
    </span>
  );
}
