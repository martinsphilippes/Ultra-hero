import "server-only";
import { defaultTimeZone } from "@/i18n/config";
import { zonedDayKey } from "@/lib/calendar/grid";
import { listEvents } from "@/lib/calendar/queries";
import { myPayouts } from "@/lib/finance/queries";
import type { MyHero } from "@/app/creator/(hero)/_lib/creator";
import { mergeAgenda, nextEvent } from "./agenda";
import { dueThisMonth, earningsDueThisMonth, effectiveStatus } from "./finance";
import { heroRights } from "./rules";
import { listOpenServices, listServiceDates, listUpcomingHeroEvents } from "./server";

// Resumo do herói no Perfil (0094): próximo compromisso e "a receber este mês". Para o herói com agência, vem do
// escritório (agenda e ganhos do casting; só o cachê do creator); para o independente, das tabelas do próprio herói.
// A equipe vê só a agenda: nada de valores para quem não é titular.

export type HeroShortcutData = {
  /** Agenda e ganhos moram no escritório do casting. */
  hasAgency: boolean;
  canSeeFinance: boolean;
  next: { title: string; startsAt: string; allDay: boolean } | null;
  /** Em aberto no mês (null: sem financeiro para mostrar). */
  dueMonth: { cents: number; count: number } | null;
  overdueCount: number;
};

export async function loadHeroShortcutData(hero: MyHero, agency: { talentId: string; creatorId: string | null } | null, now = new Date()): Promise<HeroShortcutData> {
  const tz = defaultTimeZone;
  const today = zonedDayKey(now, tz);
  const rights = heroRights(hero.role, hero.status);
  const hasAgency = agency !== null && agency.creatorId === hero.id;
  if (hasAgency && agency) {
    const to = new Date(now.getTime() + 60 * 86_400_000).toISOString();
    const [events, payouts] = await Promise.all([
      listEvents({ from: now.toISOString(), to, overlap: true, talentId: agency.talentId }),
      rights.canSeeFinance ? myPayouts() : Promise.resolve({ available: true, items: [] }),
    ]);
    const next = nextEvent(events.items, now);
    return {
      hasAgency: true,
      canSeeFinance: rights.canSeeFinance,
      next: next ? { title: next.title, startsAt: next.startsAt, allDay: next.allDay } : null,
      dueMonth: rights.canSeeFinance && payouts.available ? earningsDueThisMonth(payouts.items, today) : null,
      overdueCount: 0,
    };
  }
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const [events, dates, open] = await Promise.all([
    listUpcomingHeroEvents(hero.id, now.toISOString(), 5),
    listServiceDates(hero.id, today, zonedDayKey(in30, tz)),
    rights.canSeeFinance ? listOpenServices(hero.id) : Promise.resolve([]),
  ]);
  const merged = mergeAgenda(events, dates, tz);
  const next = nextEvent(merged, now);
  return {
    hasAgency: false,
    canSeeFinance: rights.canSeeFinance,
    next: next ? { title: next.title, startsAt: next.startsAt, allDay: next.allDay } : null,
    dueMonth: rights.canSeeFinance ? dueThisMonth(open, today) : null,
    overdueCount: rights.canSeeFinance ? open.filter((s) => effectiveStatus(s, today) === "overdue").length : 0,
  };
}
