import { BookOpen, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { NewMeetingButton } from "@/components/creator-meetings/MeetingButtons";
import { Badge, Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { postChecklist, postProgress } from "@/lib/creator-meetings/format";
import { loadMeetings } from "@/lib/creator-meetings/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorMeetings.meta");
  return { title: t("list") };
}

type Props = { params: Promise<{ id: string }> };

// Reuniões (0138): as atas do Hero (rascunho e concluídas), com encaminhamentos pendentes, follow-up e checklist.
// Toda a equipe da agência (staff+) vê e registra; o guia da reunião é da Groscove.
export default async function TalentMeetingsPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const [t, locale, meetings] = await Promise.all([getTranslations("creatorMeetings"), getLocale() as Promise<Locale>, loadMeetings(talent.id)]);
  if (!meetings) return null;
  const groscove = ctx.agency.slug === "groscove" || ctx.platformAdmin;
  const base = `/agencia/casting/${talent.id}/reunioes`;

  return (
    <div className="flex flex-col gap-4" data-testid="talent-meetings">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg">{t("list.title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("list.lead")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {talent.archived ? null : <NewMeetingButton talentId={talent.id} />}
        <Button asChild size="sm" variant="secondary" leadingIcon={<ListChecks />}>
          <Link href="/agencia/casting/encaminhamentos">{t("list.actions")}</Link>
        </Button>
        {groscove ? (
          <Button asChild size="sm" variant="ghost" leadingIcon={<BookOpen />}>
            <Link href="/agencia/casting/guia-da-reuniao">{t("list.guide")}</Link>
          </Button>
        ) : null}
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="type-body-sm font-semibold text-fg">{t("list.empty")}</p>
          <p className="type-caption text-fg-muted">{t("list.emptyHint")}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {meetings.map((m) => {
            const progress = postProgress(
              postChecklist({ checks: m.checks, formatsAnswered: m.formatsAnswered, hasQuestions: m.hasQuestions, followUpOn: m.followUpOn, actionsReady: m.actionsReady }),
            );
            return (
              <li key={m.id}>
                <Link
                  href={`${base}/${m.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-4"
                  data-testid="meeting-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" variant={m.status === "final" ? "success" : "warning"}>
                      {t(`list.status.${m.status}`)}
                    </Badge>
                    <span className="text-sm font-semibold text-fg">{formatDateTime(m.heldAt, locale)}</span>
                    <span className="type-caption text-fg-muted">{t(`modes.${m.mode}`)}</span>
                  </div>
                  <p className="line-clamp-2 type-body-sm text-fg">{m.summary || t("list.noSummary")}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 type-caption text-fg-muted">
                    {m.representative ? <span>{t("list.by", { name: m.representative })}</span> : null}
                    <span>{t("list.pending", { count: m.actionsPending })}</span>
                    {m.followUpOn ? <span>{t("list.followUp", { date: formatPlainDate(m.followUpOn, locale) })}</span> : null}
                    {m.status === "final" ? <span>{t("list.checklist", progress)}</span> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
