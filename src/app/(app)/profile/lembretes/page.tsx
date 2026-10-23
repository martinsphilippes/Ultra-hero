import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { isValidTimeZone, localDateIn, ymdToDate } from "@/components/me/dates";
import { RemindersList, type ReminderListItem } from "@/components/me/reminders/RemindersList";
import { DemoBadge, PageHeader } from "@/components/ui";
import { getProfile, requireUser } from "@/lib/auth/session";
import { shortTime, splitReminders, type ReminderRow } from "@/lib/routine/reminders";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("reminders") };
}

// Limite de lembretes ativos do gatilho routine_items_limit (0022).
const MAX_REMINDERS = 20;

// Lembretes (Q5 do responsável): os itens de rotina criados à mão saíram do Hoje e moram aqui, com
// adicionar, editar, excluir e marcar "feito hoje". O Hoje continua sem campo de digitação. Marcar um
// lembrete não conta na sequência (Q10, 0037). Dados em routine_items/routine_checks (RLS do dono).
export default async function RemindersPage() {
  const user = await requireUser("/profile/lembretes");
  const [profile, locale, t, tc] = await Promise.all([getProfile(), getLocale(), getTranslations("me.reminders"), getTranslations("common")]);
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  const supabase = await createClient();

  const [itemsRes, checksRes] = await Promise.all([
    supabase.from("routine_items").select("id, title, note, time_of_day, weekdays, active, sort_order").eq("user_id", user.id).eq("active", true).order("sort_order"),
    supabase.from("routine_checks").select("item_id").eq("user_id", user.id).eq("local_date", today).eq("done", true),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (checksRes.error) throw new Error(checksRes.error.message);

  const doneToday = new Set((checksRes.data ?? []).map((c) => c.item_id));
  const toView = (row: ReminderRow): ReminderListItem => ({
    id: row.id,
    title: row.title,
    note: row.note,
    time: shortTime(row.time_of_day),
    weekdays: row.weekdays,
    doneToday: doneToday.has(row.id),
  });
  const { today: forToday, other } = splitReminders((itemsRes.data ?? []) as ReminderRow[], today);
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(ymdToDate(today));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={<time dateTime={today} data-testid="reminders-date">{dateLabel}</time>}
        backHref="/profile"
        backLabel={tc("actions.back")}
        actions={<DemoBadge />}
      />

      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 type-body-sm text-fg-muted" data-testid="reminders-info">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <span>{t("info")}</span>
      </p>

      <RemindersList today={forToday.map(toView)} other={other.map(toView)} max={MAX_REMINDERS} />
    </div>
  );
}
