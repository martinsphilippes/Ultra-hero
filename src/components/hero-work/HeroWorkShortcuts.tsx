import { CalendarDays, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { HeroMoney } from "@/components/hero-work/HeroMoney";
import type { Locale } from "@/i18n/config";
import { defaultTimeZone } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { HeroShortcutData } from "@/lib/hero-work/summary";

const BUTTON =
  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-3 py-3 text-base font-semibold shadow-sm transition-[background-color,box-shadow] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Atalhos do herói no Perfil (pedido do responsável): "Agenda" e "Financeiro" em botões grandes, com o próximo
// compromisso e "A receber este mês". Levam ao Portal do Herói: com agência, a agenda e os
// ganhos do casting (e os próprios, se houver); independente, as ferramentas do próprio herói. A equipe só tem a Agenda; o financeiro é do titular. Registro simulado.
export async function HeroWorkShortcuts({ data }: { data: HeroShortcutData }) {
  const [t, locale] = await Promise.all([getTranslations("heroWork.shortcuts"), getLocale() as Promise<Locale>]);
  // Portal do Herói (0097): agenda e financeiro são uma tela só (com agência, os da agência + os próprios)
  const agendaHref = "/heroi/agenda";
  const financeHref = "/heroi/financeiro";
  const when = data.next
    ? data.next.allDay
      ? formatDate(data.next.startsAt, locale, { weekday: "short", day: "2-digit", month: "2-digit" }, defaultTimeZone)
      : formatDate(data.next.startsAt, locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }, defaultTimeZone)
    : null;
  return (
    <section aria-labelledby="hero-work-title" className="flex flex-col gap-3" data-testid="hero-work-shortcuts">
      <h3 id="hero-work-title" className="sr-only">
        {t("title")}
      </h3>
      <div className={data.canSeeFinance ? "grid grid-cols-2 gap-2" : "flex flex-col"}>
        <Link href={agendaHref} data-testid="hero-shortcut-agenda" className={`${BUTTON} bg-accent text-accent-fg hover:bg-accent-hover`}>
          <CalendarDays className="size-6" aria-hidden="true" />
          {t("agenda")}
        </Link>
        {data.canSeeFinance ? (
          <Link href={financeHref} data-testid="hero-shortcut-finance" className={`${BUTTON} border border-accent/50 bg-surface text-fg hover:bg-accent-soft`}>
            <Wallet className="size-6 text-accent-text" aria-hidden="true" />
            {t("finance")}
          </Link>
        ) : null}
      </div>
      <dl className={data.canSeeFinance ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"} data-testid="hero-work-summary">
        <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface p-3">
          <dt className="type-caption font-semibold uppercase tracking-wider text-fg-muted">{t("next")}</dt>
          <dd className="min-w-0 text-sm text-fg" data-testid="hero-next-event">
            {data.next ? (
              <>
                <span className="block truncate font-semibold">{data.next.title}</span>
                <span className="type-caption text-fg-muted">{when}</span>
              </>
            ) : (
              <span className="type-caption text-fg-muted">{t("nextNone")}</span>
            )}
          </dd>
        </div>
        {data.canSeeFinance && data.dueMonth ? (
          <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface p-3">
            <dt className="type-caption font-semibold uppercase tracking-wider text-fg-muted">{t("receivableMonth")}</dt>
            <dd className="text-sm text-fg" data-testid="hero-receivable-month">
              <HeroMoney cents={data.dueMonth.cents} locale={locale} className="block font-mono text-base font-semibold" />
              <span className="type-caption text-fg-muted">
                {data.dueMonth.count > 0 ? t("receivableCount", { count: data.dueMonth.count }) : t("receivableNone")}
                {data.overdueCount > 0 ? ` · ${t("overdue", { count: data.overdueCount })}` : ""}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
