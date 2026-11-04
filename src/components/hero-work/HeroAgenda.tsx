"use client";

import { CalendarPlus, Pencil, Trash2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { Button, useToast } from "@/components/ui";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { deleteHeroEventAction } from "@/lib/hero-work/actions";
import { heroEventToInput, newHeroEventDefaults, type HeroCalendarEvent, type HeroEvent } from "@/lib/hero-work/agenda";
import type { HeroEventInput } from "@/lib/hero-work/vocab";
import { HeroChecklist } from "./HeroChecklist";
import { HeroEventDialog, type ServiceOption } from "./HeroEventDialog";

type Props = {
  creatorId: string;
  events: HeroCalendarEvent[];
  /** Compromissos crus (para editar: o formulário parte do que está salvo). */
  editable: HeroEvent[];
  services: ServiceOption[];
  timeZone: string;
  year: number;
  month: number;
  today: string;
  requestedDay?: string | null;
  canWrite: boolean;
  /** Só o titular tem o financeiro: o item de serviço leva até lá. */
  canSeeFinance: boolean;
};

// Agenda do herói: a grade mensal e a lista do dia da agenda das agências (AgendaCalendar), com o que o herói precisa
// executar em cada item (contratante, local, observações, checklist). O titular cria, edita e exclui; a equipe lê.
export function HeroAgenda({ creatorId, events, editable, services, timeZone, year, month, today, requestedDay, canWrite, canSeeFinance }: Props) {
  const t = useTranslations("heroWork.agenda");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<HeroEventInput>(() => newHeroEventDefaults(creatorId, null, today));
  const [version, setVersion] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openNew = useCallback(
    (day?: string | null) => {
      setInitial(newHeroEventDefaults(creatorId, day ?? selectedDay, today));
      setVersion((n) => n + 1);
      setOpen(true);
    },
    [creatorId, selectedDay, today],
  );
  const openEdit = useCallback(
    (id: string) => {
      const e = editable.find((x) => x.id === id);
      if (!e) return;
      setInitial(heroEventToInput(e, timeZone));
      setVersion((n) => n + 1);
      setOpen(true);
    },
    [editable, timeZone],
  );

  function remove(e: CalendarEvent) {
    if (!window.confirm(t("confirmDelete", { title: e.title }))) return;
    start(async () => {
      const result = await deleteHeroEventAction({ id: e.id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  const heroOf = (e: CalendarEvent) => (e as HeroCalendarEvent).hero;

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Button type="button" size="lg" leadingIcon={<CalendarPlus />} onClick={() => openNew()} className="w-full sm:w-fit" data-testid="hero-event-new">
          {t("new")}
        </Button>
      ) : null}
      <AgendaCalendar
        events={events}
        timeZone={timeZone}
        portal="office"
        year={year}
        month={month}
        today={today}
        base="/heroi/agenda"
        requestedDay={requestedDay}
        emptyTitle={t("empty")}
        emptyHint={canWrite ? t("emptyHint") : t("emptyHintMember")}
        onDayChange={setSelectedDay}
        dayAction={(day, dateLabel) =>
          canWrite ? (
            <Button type="button" size="sm" variant="secondary" leadingIcon={<CalendarPlus />} onClick={() => openNew(day)} aria-label={t("newOnDayLabel", { date: dateLabel })} data-testid="hero-event-new-on-day">
              {t("newOnDay")}
            </Button>
          ) : null
        }
        renderExtra={(e) => {
          const h = heroOf(e);
          if (!h) return null;
          return (
            <>
              {h.source === "service" ? <span className="type-caption text-fg-subtle">{t("serviceDate")}</span> : null}
              {h.checklist.length > 0 ? <HeroChecklist eventId={e.id} items={h.checklist} canToggle={canWrite} /> : null}
            </>
          );
        }}
        renderActions={(e) => {
          const h = heroOf(e);
          if (!h) return null;
          if (h.source === "service") {
            return canSeeFinance ? (
              <Button asChild size="sm" variant="ghost" leadingIcon={<Wallet />}>
                <Link href="/heroi/financeiro" aria-label={t("openFinanceLabel", { title: e.title })} data-testid="hero-service-open">
                  <span className="sr-only sm:not-sr-only">{t("openFinance")}</span>
                </Link>
              </Button>
            ) : null;
          }
          if (!canWrite) return null;
          return (
            <span className="flex shrink-0 items-center gap-1">
              <Button type="button" size="sm" variant="ghost" leadingIcon={<Pencil />} onClick={() => openEdit(e.id)} aria-label={t("editLabel", { title: e.title })} data-testid="hero-event-edit">
                <span className="sr-only sm:not-sr-only">{t("edit")}</span>
              </Button>
              <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => remove(e)} disabled={pending} aria-label={t("deleteLabel", { title: e.title })} data-testid="hero-event-delete">
                <span className="sr-only sm:not-sr-only">{t("delete")}</span>
              </Button>
            </span>
          );
        }}
      />
      {canWrite ? <HeroEventDialog key={version} open={open} onOpenChange={setOpen} initial={initial} services={services} /> : null}
    </div>
  );
}

