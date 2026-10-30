// Preferências de notificação (RF-023): vocabulário compartilhado entre a tela (cliente) e a action.
// Opt-in por tipo e por canal. O push do app das lojas respeita channel_push + o tipo (0054;
// docs/decisions/push-notifications.md); e-mail opcional ainda não é enviado. Mensagens
// transacionais (confirmação de cadastro, redefinição de senha) não têm opt-out e não aparecem aqui.

// auction_outbid: lance superado nos Colecionáveis (0061)
export const NOTIFICATION_TYPES = ["hero_posts", "achievements", "auction_outbid", "streak_reminders", "editorial_digest", "commerce_updates"] as const;
export const NOTIFICATION_CHANNELS = ["channel_email", "channel_push"] as const;
export const NOTIFICATION_PREFERENCE_KEYS = [...NOTIFICATION_TYPES, ...NOTIFICATION_CHANNELS] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

// Mesmos padrões da tabela notification_preferences (0018, 0054, 0061): tipos desligados, e-mail ligado, push desligado.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  hero_posts: false,
  achievements: false,
  auction_outbid: false,
  editorial_digest: false,
  streak_reminders: false,
  commerce_updates: false,
  channel_email: true,
  channel_push: false,
};
