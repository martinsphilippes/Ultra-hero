"use client";

import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { Button } from "@/components/ui";
import { BrandQuickActions, newProposalHref } from "./BrandQuickActions";

type CalendarProps = Omit<ComponentProps<typeof AgendaCalendar>, "dayAction" | "onDayChange" | "portal">;

// Agenda da marca: os atalhos acompanham o dia escolhido na grade — "Nova proposta" (no topo e na lista do dia) já
// abre a campanha com essa data no início do período.
export function BrandAgenda({ canPropose, ...calendar }: CalendarProps & { canPropose: boolean }) {
  const t = useTranslations("brandPortal.dashboard");
  const [day, setDay] = useState<string | null>(calendar.requestedDay ?? null);
  return (
    <>
      <BrandQuickActions canPropose={canPropose} day={day} />
      <AgendaCalendar
        {...calendar}
        portal="brand"
        onDayChange={setDay}
        dayAction={
          canPropose
            ? (selected, dateLabel) => (
                <Button asChild size="sm" variant="secondary" leadingIcon={<Megaphone />}>
                  <Link href={newProposalHref(selected)} aria-label={t("proposeOnDayLabel", { date: dateLabel })} data-testid="brand-propose-on-day">
                    {t("proposeOnDay")}
                  </Link>
                </Button>
              )
            : undefined
        }
      />
    </>
  );
}
