// Vocabulário do push compartilhado entre cliente e servidor (sem dependência de servidor).

/** Token do aparelho guardado em cookie, para o "Sair" do app desligar o push deste aparelho. */
export const PUSH_TOKEN_COOKIE = "uh-push-token";

/** Mesmo formato que o banco aceita (push_tokens_token_check, 0054). */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

/** Tipos que o app liga quando a pessoa aceita o push no contexto (favoritar herói, tela de avisos). */
export type PushOptIn = "hero_posts" | "achievements" | "streak_reminders";
