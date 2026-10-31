import { z } from "zod";

// Validação da action de preferências de notificação (RF-023). As colunas booleanas da
// tabela notification_preferences (0018, 0054, 0061) e nada além delas; o banco só aceita a linha do próprio usuário.
// Componentes cliente importam o vocabulário de ./constants (sem zod no bundle).

export {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationPreferenceKey,
  type NotificationPreferences,
  type NotificationType,
} from "./constants";

export const notificationPreferencesSchema = z
  .object({
    hero_posts: z.boolean(),
    achievements: z.boolean(),
    auction_outbid: z.boolean(),
    office_updates: z.boolean(),
    editorial_digest: z.boolean(),
    streak_reminders: z.boolean(),
    commerce_updates: z.boolean(),
    channel_email: z.boolean(),
    channel_push: z.boolean(),
  })
  .strict();
