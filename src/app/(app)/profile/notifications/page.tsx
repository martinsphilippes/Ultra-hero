import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BellOff } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/me/NotificationPreferencesForm";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@/components/me/notifications/constants";
import { DemoBadge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("notifications") };
}

// Preferências de notificação (RF-023): opt-in por tipo e por canal, guardadas por usuário (RLS).
// Nada é enviado na demonstração; mensagens transacionais não têm opt-out e aparecem só como leitura.
export default async function NotificationsPage() {
  const user = await requireUser("/profile/notifications");
  const [t, tc] = await Promise.all([getTranslations("me.notifications"), getTranslations("common")]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("editorial_digest, streak_reminders, commerce_updates, channel_email, channel_push")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const initial: NotificationPreferences = data ?? DEFAULT_NOTIFICATION_PREFERENCES;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} actions={<DemoBadge />} />

      <section aria-labelledby="notifications-demo-title" className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <BellOff className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="notifications-demo-title" className="type-h3 text-fg">
            {t("demo.title")}
          </h2>
          <p className="type-body-sm max-w-prose text-fg-muted">{t("demo.body")}</p>
        </div>
      </section>

      <NotificationPreferencesForm initial={initial} />
    </div>
  );
}
