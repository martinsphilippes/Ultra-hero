"use client";

import { Bell, Lock, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveNotificationPreferences } from "@/app/(app)/profile/actions";
import { registerPushToken } from "@/app/(app)/push-actions";
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, type NotificationPreferenceKey, type NotificationPreferences } from "@/components/me/notifications/constants";
import { Badge, Button, Switch, useToast } from "@/components/ui";
import { hasNativeBridge, requestNativePush } from "@/lib/native-app/client";
import { cn } from "@/lib/utils";

type Props = { initial: NotificationPreferences };

const TRANSACTIONAL = ["confirmation", "password", "security"] as const;

// Formulário das preferências: tipos opcionais (opt-in), transacionais (sempre ativas, só leitura)
// e canais. Salva por upsert sob RLS; o banco só aceita a linha do próprio usuário.
export function NotificationPreferencesForm({ initial }: Props) {
  const t = useTranslations("me.notifications");
  const { toast } = useToast();
  const router = useRouter();
  const baseId = useId();
  const [values, setValues] = useState<NotificationPreferences>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = (Object.keys(values) as NotificationPreferenceKey[]).some((key) => values[key] !== initial[key]);

  function set(key: NotificationPreferenceKey, checked: boolean) {
    setValues((v) => ({ ...v, [key]: checked }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // App das lojas: ligar o Push pede a permissão do sistema antes de salvar; sem ela, não liga
      if (values.channel_push && !initial.channel_push && hasNativeBridge()) {
        const push = await requestNativePush(true);
        if (!push.ok) {
          setError(push.reason === "denied" ? t("errors.push_denied") : t("errors.push_unavailable"));
          return;
        }
        await registerPushToken({ token: push.token });
      }
      const result = await saveNotificationPreferences(values);
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      toast({ title: t("saved"), variant: "success" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Group id={`${baseId}-types`} icon={<Bell className="size-5" />} title={t("types.title")} description={t("types.description")}>
        {NOTIFICATION_TYPES.map((key) => (
          // pedidos de teste não existem no app das lojas
          <li key={key} className={cn("py-2", key === "commerce_updates" && "native:hidden")}>
            <Switch id={`${baseId}-${key}`} checked={values[key]} onCheckedChange={(checked) => set(key, checked)} disabled={pending} label={t(`types.${key}.label`)} description={t(`types.${key}.description`)} />
          </li>
        ))}
      </Group>

      <Group id={`${baseId}-transactional`} icon={<Lock className="size-5" />} title={t("transactional.title")} description={t("transactional.description")}>
        {TRANSACTIONAL.map((key) => (
          <li key={key} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm text-fg">
            <span className="font-medium">{t(`transactional.items.${key}`)}</span>
            <Badge variant="success">{t("transactional.always")}</Badge>
          </li>
        ))}
      </Group>

      <Group id={`${baseId}-channels`} icon={<Send className="size-5" />} title={t("channels.title")} description={t("channels.description")}>
        {NOTIFICATION_CHANNELS.map((key) => (
          <li key={key} className="py-2">
            <Switch id={`${baseId}-${key}`} checked={values[key]} onCheckedChange={(checked) => set(key, checked)} disabled={pending} label={t(`channels.${key}.label`)} description={t(`channels.${key}.description`)} />
          </li>
        ))}
      </Group>

      <div className="flex flex-col items-end gap-2">
        {error ? (
          <p role="alert" className="type-caption font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function Group({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          {icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id={`${id}-title`} className="type-h3 text-fg">
            {title}
          </h2>
          <p className="type-body-sm text-fg-muted">{description}</p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </section>
  );
}
