import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ActionDoneButton } from "@/components/creator-meetings/MeetingButtons";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { type DueBucket, dueBucket, meetingDay } from "@/lib/creator-meetings/format";
import { loadOpenMeetingActions } from "@/lib/creator-meetings/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorMeetings.meta");
  return { title: t("actions") };
}

type Props = { searchParams: Promise<{ meus?: string }> };
const BUCKETS: readonly DueBucket[] = ["overdue", "today", "week", "later", "none"];

// Encaminhamentos (0138): o que ficou combinado nas atas concluídas e ainda está pendente, do prazo mais próximo
// ao mais distante. "Meus" mostra só o que está com a pessoa. Marcar como feito tira da lista.
export default async function MeetingActionsPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const { meus } = await searchParams;
  const mine = meus === "1";
  const [t, tc, locale, list] = await Promise.all([
    getTranslations("creatorMeetings"),
    getTranslations("agency.casting"),
    getLocale() as Promise<Locale>,
    loadOpenMeetingActions(ctx.agency.id, mine),
  ]);
  const items = list ?? [];
  const today = meetingDay(new Date().toISOString());
  const groups = BUCKETS.map((b) => ({ bucket: b, items: items.filter((a) => dueBucket(a.dueOn, today) === b) })).filter((g) => g.items.length > 0);
  const chip = "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <div className="flex flex-col gap-5" data-testid="meeting-actions-page">
      <PageHeader title={t("actionsPage.title")} description={t("actionsPage.lead")} backHref="/agencia/casting" backLabel={tc("title")} />
      <nav aria-label={t("actionsPage.title")} className="flex flex-wrap gap-2">
        <Link href="/agencia/casting/encaminhamentos?meus=1" aria-current={mine ? "page" : undefined} className={cn(chip, mine ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg")}>
          {t("actionsPage.mine")}
        </Link>
        <Link href="/agencia/casting/encaminhamentos" aria-current={!mine ? "page" : undefined} className={cn(chip, !mine ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg")}>
          {t("actionsPage.all")}
        </Link>
      </nav>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("actionsPage.empty")}</p>
      ) : (
        groups.map((g) => (
          <section key={g.bucket} className="flex flex-col gap-2" aria-labelledby={`bucket-${g.bucket}`}>
            <h2 id={`bucket-${g.bucket}`} className={cn("flex items-center gap-2 text-base font-semibold", g.bucket === "overdue" ? "text-danger" : "text-fg")}>
              {t(`actionsPage.buckets.${g.bucket}`)}
              <Badge size="sm" variant={g.bucket === "overdue" ? "danger" : "neutral"}>
                {g.items.length}
              </Badge>
            </h2>
            <ul className="flex flex-col gap-2">
              {g.items.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="open-action">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar src={a.photoUrl} name={a.talentName} size="sm" alt="" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{a.title}</p>
                      <p className="type-caption text-fg-muted">
                        {[
                          a.talentName,
                          a.ownerKind === "talent" ? t("owner.talent") : (a.owner ?? t("owner.none")),
                          a.dueOn ? formatPlainDate(a.dueOn, locale) : t("owner.noDue"),
                        ].join(" · ")}
                      </p>
                      <Link href={`/agencia/casting/${a.talentId}/reunioes/${a.meetingId}`} className="type-caption font-semibold text-accent-text underline-offset-2 hover:underline">
                        {t("actionsPage.meetingOf", { date: formatPlainDate(meetingDay(a.heldAt), locale) })}
                      </Link>
                    </div>
                  </div>
                  <ActionDoneButton actionId={a.id} talentId={a.talentId} meetingId={a.meetingId} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
