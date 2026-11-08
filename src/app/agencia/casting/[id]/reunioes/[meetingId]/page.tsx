import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MeetingEditor } from "@/components/creator-meetings/MeetingEditor";
import { MeetingTools } from "@/components/creator-meetings/MeetingTools";
import type { EntityOption } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { listTeam } from "@/lib/agency/queries";
import { meetingSubject } from "@/lib/creator-guide/format";
import { meetingDay, meetingFileName, meetingText } from "@/lib/creator-meetings/format";
import { loadMeeting } from "@/lib/creator-meetings/queries";
import { memberOption } from "@/lib/ui/entity";
import { loadTalent } from "../../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorMeetings.meta");
  return { title: t("meeting") };
}

type Props = { params: Promise<{ id: string; meetingId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A ata (0138): formalização (assunto, arquivo, texto, impressão em PDF) e o formulário A–K.
export default async function MeetingPage({ params }: Props) {
  const { id, meetingId } = await params;
  if (!UUID.test(meetingId)) notFound();
  const { ctx, talent } = await loadTalent(id);
  const [t, tp, locale, meeting, team] = await Promise.all([
    getTranslations("creatorMeetings"),
    getTranslations("pickers"),
    getLocale() as Promise<Locale>,
    loadMeeting(meetingId),
    listTeam(ctx.agency.id),
  ]);
  if (!meeting || meeting.talentId !== talent.id) notFound();

  // equipe ativa + quem já aparece na ata e saiu da agência (para o nome não sumir das caixas)
  const options: EntityOption[] = team.map((m) => memberOption(tp, m));
  const known = new Set(options.map((o) => o.value));
  const keep = (value: string | null, name: string | null) => {
    if (value && !known.has(value)) {
      options.push({ value, name: name ?? "—" });
      known.add(value);
    }
  };
  keep(meeting.representativeId, meeting.representative);
  keep(meeting.senderId, meeting.sender);
  for (const a of meeting.actions) keep(a.ownerId, a.owner);

  const day = meetingDay(meeting.heldAt);
  const text = meetingText(
    {
      talentName: meeting.talentName,
      heldAt: meeting.heldAt,
      mode: meeting.mode,
      representative: meeting.representative,
      participants: meeting.participants,
      fullName: meeting.fullName,
      contactConfirmed: meeting.contactConfirmed,
      contactFix: meeting.contactFix,
      notes: meeting.notes,
      formats: meeting.formats,
      actionTitle: meeting.availableActions.find((a) => a.key === meeting.actionKey)?.title ?? null,
      actionInterest: meeting.actionInterest,
      checks: meeting.checks,
      actions: meeting.actions,
      sender: meeting.sender,
      sentOn: meeting.sentOn,
      followUpOn: meeting.followUpOn,
    },
    (key, values) => t(key, values),
    { date: (d) => formatPlainDate(d, locale), dateTime: (iso) => formatDateTime(iso, locale) },
  );

  return (
    <div className="flex flex-col gap-4" data-testid="meeting-page">
      <div className="flex flex-col gap-1">
        <Link
          href={`/agencia/casting/${talent.id}/reunioes`}
          className="inline-flex min-h-9 items-center gap-1 self-start text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("meta.list")}
        </Link>
        <h2 className="text-lg font-semibold text-fg">
          {t("meta.meeting")} · {formatDateTime(meeting.heldAt, locale)}
        </h2>
      </div>
      <MeetingTools subject={meetingSubject(meeting.talentName, day)} fileName={meetingFileName(meeting.talentName, day)} text={text} />
      <MeetingEditor meeting={meeting} memberOptions={options} today={meetingDay(new Date().toISOString())} />
    </div>
  );
}
