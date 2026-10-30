import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_TYPES,
  notificationPreferencesSchema,
} from "@/components/me/notifications/schema";

// Preferências de notificação (RF-023): o schema da action aceita exatamente as colunas booleanas
// da tabela notification_preferences (0018, e os tipos do push da 0054) e nada além delas.

describe("notificationPreferencesSchema", () => {
  it("aceita as preferências com os padrões da tabela", () => {
    const parsed = notificationPreferencesSchema.safeParse(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({
      hero_posts: false,
      achievements: false,
      auction_outbid: false,
      editorial_digest: false,
      streak_reminders: false,
      commerce_updates: false,
      channel_email: true,
      channel_push: false,
    });
  });

  it("mantém a lista de chaves alinhada com tipos + canais", () => {
    expect(NOTIFICATION_TYPES).toEqual(["hero_posts", "achievements", "auction_outbid", "streak_reminders", "editorial_digest", "commerce_updates"]);
    expect(NOTIFICATION_CHANNELS).toEqual(["channel_email", "channel_push"]);
    expect([...NOTIFICATION_PREFERENCE_KEYS].sort()).toEqual(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).sort());
  });

  it("aceita qualquer combinação de booleanos", () => {
    const all = Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS.map((k) => [k, true]));
    expect(notificationPreferencesSchema.safeParse(all).success).toBe(true);
    const none = Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS.map((k) => [k, false]));
    expect(notificationPreferencesSchema.safeParse(none).success).toBe(true);
  });

  it("recusa chave faltando", () => {
    const { channel_push: _omit, ...partial } = DEFAULT_NOTIFICATION_PREFERENCES;
    void _omit;
    expect(notificationPreferencesSchema.safeParse(partial).success).toBe(false);
  });

  it("recusa chave extra (não há opt-out de mensagens transacionais)", () => {
    expect(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, transactional: false }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, user_id: "00000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });

  it("recusa valores que não são booleanos (sem coerção)", () => {
    expect(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, channel_email: "true" }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, editorial_digest: 1 }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, streak_reminders: null }).success).toBe(false);
  });
});
