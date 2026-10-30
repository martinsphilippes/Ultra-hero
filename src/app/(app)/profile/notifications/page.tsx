import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BellRing } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/me/NotificationPreferencesForm";
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_PREFERENCE_KEYS, type NotificationPreferences } from "@/components/me/notifications/constants";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("notifications") };
}

// Preferências de notificação (RF-023): opt-in por tipo e por canal, guardadas por usuário (RLS).
// O push do app das lojas respeita estas escolhas (0054); e-mail opcional ainda não é enviado.
// Mensagens transacionais não têm opt-out e aparecem só como leitura.
export default async function NotificationsPage() {
  const user = await requireUser("/profile/notifications");
  const [t, tc] = await Promise.all([getTranslations("me.notifications"), getTranslations("common")]);
  const supabase = await createClient();
  // "*": num banco sem a 0061 a coluna auction_outbid ainda não existe (fica com o padrão, desligada)
  const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  const initial: NotificationPreferences = Object.fromEntries(
    NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, typeof data?.[key] === "boolean" ? data[key] : DEFAULT_NOTIFICATION_PREFERENCES[key]]),
  ) as NotificationPreferences;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />

      <section aria-labelledby="notifications-delivery-title" className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <BellRing className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="notifications-delivery-title" className="type-h3 text-fg">
            {t("delivery.title")}
          </h2>
          <p className="type-body-sm max-w-prose text-fg-muted">{t("delivery.body")}</p>
        </div>
      </section>

      <NotificationPreferencesForm initial={initial} />
    </div>
  );
}
