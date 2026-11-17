import { afterEach, describe, expect, it, vi } from "vitest";

// 17/11/2026: a regra "Hero só pelo aplicativo" (0141/0142) sai do padrão — o Hero volta a entrar pelo site, pelos links e
// pelo PWA. A tela /acesso-pelo-app só vale com a regra religada (CREATOR_APP_ONLY=true); sem ela, link antigo ou favorito
// vai ao login, sem a mensagem que não vale mais.

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/components/auth/AuthCard", () => ({ AuthCard: () => null }));
vi.mock("@/components/auth/CreatorAppOnlyNotice", () => ({ CreatorAppOnlyNotice: () => null }));
vi.mock("@/components/auth/NativeAppRecover", () => ({ NativeAppRecover: () => null }));

const { default: AppOnlyPage } = await import("@/app/(auth)/acesso-pelo-app/page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/acesso-pelo-app", () => {
  it("sem a regra (padrão): link antigo vai ao login", async () => {
    vi.stubEnv("CREATOR_APP_ONLY", "");
    await expect(AppOnlyPage()).rejects.toThrow("REDIRECT /login");
  });

  it("com a regra religada (CREATOR_APP_ONLY=true): mostra a mensagem do aplicativo", async () => {
    vi.stubEnv("CREATOR_APP_ONLY", "true");
    await expect(AppOnlyPage()).resolves.toBeTruthy();
  });
});
