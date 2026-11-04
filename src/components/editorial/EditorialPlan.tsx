import { CalendarDays, ChevronLeft, ChevronRight, Lightbulb, Newspaper, Plus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { defaultTimeZone, type Locale } from "@/i18n/config";
import { formatDate, formatPlainDate } from "@/i18n/format";
import { zonedDayKey } from "@/lib/calendar/grid";
import { plusDays } from "@/lib/calendar/ics";
import { listEditorialPosts } from "@/lib/culture/queries";
import { parseWeek, planByDay, weekDays, type AgendaPost } from "@/lib/editorial/vocab";
import { toZonedIso } from "@/lib/deals/schemas";
import { cn } from "@/lib/utils";

type Props = {
  /** null = Groscove (admin); senão a agência. */
  agencyId: string | null;
  /** Rota do planejamento (ex.: /admin/agenda/conteudos). */
  base: string;
  /** Rota da agenda do portal (volta). */
  agendaHref: string;
  sp: { v?: string; semana?: string };
};

const STATUS_VARIANT = { draft: "neutral", scheduled: "info", published: "success" } as const;

// Planejamento editorial (0101): notícias e dicas por data, em semana (segunda a domingo, fuso de Brasília) ou lista.
// Rascunhos ficam à parte (sem data). Cada item abre o editor.
export async function EditorialPlan({ agencyId, base, agendaHref, sp }: Props) {
  const [t, tp, locale] = await Promise.all([getTranslations("culture.editorial"), getTranslations("culture.posts"), getLocale() as Promise<Locale>]);
  const tz = defaultTimeZone;
  const view = sp.v === "lista" ? "lista" : "semana";
  const today = zonedDayKey(new Date(), tz);
  const week = parseWeek(sp.semana, today);
  const range = view === "semana" ? { from: toZonedIso(week, "00:00", tz) ?? undefined, to: toZonedIso(plusDays(week, 7), "00:00", tz) ?? undefined } : {};
  const list = await listEditorialPosts({ agencyId, from: range.from ? new Date(range.from).toISOString() : undefined, to: range.to ? new Date(range.to).toISOString() : undefined, limit: view === "lista" ? 200 : 100 });
  const plan = planByDay(list.items, tz);

  const item = (p: AgendaPost) => (
    <li key={p.id}>
      <Link href={`${base}/${p.id}`} className="flex min-h-11 items-start justify-between gap-2 rounded-xl px-2 py-2 hover:bg-surface-hover" data-testid="editorial-item" data-status={p.effective}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge size="sm" variant={p.kind === "tip" ? "success" : "info"} icon={p.kind === "tip" ? <Lightbulb /> : <Newspaper />}>
              {tp(p.kind)}
            </Badge>
            <Badge size="sm" variant={STATUS_VARIANT[p.effective]}>
              {t(`status.${p.effective}`)}
            </Badge>
            {p.publishedAt && p.status !== "draft" ? (
              <span className="type-caption text-fg-muted">{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(p.publishedAt))}</span>
            ) : null}
          </span>
          <span className="text-sm font-medium text-fg">{p.title}</span>
          {p.eventTitle ? (
            <span className="flex items-center gap-1 type-caption text-fg-muted">
              <CalendarDays className="size-3" aria-hidden="true" />
              {p.eventTitle}
            </span>
          ) : null}
        </span>
        <ChevronRight className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      </Link>
    </li>
  );

  const tabs = (
    <nav className="flex gap-2" aria-label={t("title")}>
      {(["semana", "lista"] as const).map((v) => (
        <Button key={v} asChild size="sm" variant={view === v ? "primary" : "secondary"}>
          <Link href={`${base}?v=${v}`} aria-current={view === v ? "page" : undefined}>
            {t(`views.${v}`)}
          </Link>
        </Button>
      ))}
    </nav>
  );

  return (
    <div className="flex flex-col gap-5" data-testid="editorial-plan">
      <PageHeader
        title={t("title")}
        description={t("description")}
        backHref={agendaHref}
        backLabel={t("back")}
        actions={
          <Button asChild size="sm" leadingIcon={<Plus />}>
            <Link href={`${base}/novo`} data-testid="editorial-new">
              {t("new")}
            </Link>
          </Button>
        }
      />
      <p className="type-caption text-fg-muted">{agencyId ? t("audienceAgency") : t("audienceAdmin")}</p>
      {tabs}
      {view === "semana" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button asChild size="sm" variant="ghost" leadingIcon={<ChevronLeft />}>
              <Link href={`${base}?semana=${plusDays(week, -7)}`} aria-label={t("prevWeek")}>
                <span className="sr-only sm:not-sr-only">{t("prevWeek")}</span>
              </Link>
            </Button>
            <Link href={base} className="text-sm font-semibold text-fg underline-offset-2 hover:underline">
              {t("weekOf", { date: formatPlainDate(week, locale, { day: "numeric", month: "short" }) })}
            </Link>
            <Button asChild size="sm" variant="ghost">
              <Link href={`${base}?semana=${plusDays(week, 7)}`} aria-label={t("nextWeek")}>
                <span className="sr-only sm:not-sr-only">{t("nextWeek")}</span>
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <ol className="flex flex-col gap-2">
            {weekDays(week).map((d) => {
              const posts = plan.byDay.get(d) ?? [];
              return (
                <li key={d} className={cn("rounded-2xl border bg-surface p-3", d === today ? "border-accent" : "border-border")} data-testid="editorial-day" data-day={d}>
                  <h2 className="text-sm font-semibold capitalize text-fg">{formatDate(`${d}T12:00:00Z`, locale, { weekday: "long", day: "numeric", month: "short" }, "UTC")}</h2>
                  {posts.length === 0 ? <p className="type-caption text-fg-subtle">{t("emptyDay")}</p> : <ul className="flex flex-col">{posts.map(item)}</ul>}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
      {plan.undated.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-border-strong bg-surface p-3" data-testid="editorial-undated">
          <h2 className="text-sm font-semibold text-fg">{t("undated")}</h2>
          <ul className="flex flex-col">{plan.undated.map(item)}</ul>
        </section>
      ) : null}
      {view === "lista" ? (
        list.items.filter((p) => p.status !== "draft").length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<Newspaper />} title={t("empty")} />
          </div>
        ) : (
          <ul className="flex flex-col rounded-2xl border border-border bg-surface p-2">{list.items.filter((p) => p.status !== "draft").map(item)}</ul>
        )
      ) : null}
    </div>
  );
}
