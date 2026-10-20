// Preferências de notificação (RF-023): vocabulário compartilhado entre a tela (cliente) e a action.
// Opt-in por tipo e por canal; nada é enviado na POC. Mensagens transacionais (confirmação de
// cadastro, redefinição de senha) não têm opt-out e por isso não aparecem aqui.

export const NOTIFICATION_TYPES = ["editorial_digest", "streak_reminders", "commerce_updates"] as const;
export const NOTIFICATION_CHANNELS = ["channel_email", "channel_push"] as const;
export const NOTIFICATION_PREFERENCE_KEYS = [...NOTIFICATION_TYPES, ...NOTIFICATION_CHANNELS] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

// Mesmos padrões da tabela notification_preferences (0018): tipos desligados, e-mail ligado, push desligado.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  editorial_digest: false,
  streak_reminders: false,
  commerce_updates: false,
  channel_email: true,
  channel_push: false,
};
