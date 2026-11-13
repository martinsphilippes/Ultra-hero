import { describe, expect, it } from "vitest";
import {
  APP_ONLY_PATH,
  decideAccess,
  isAndroidWebView,
  isCreatorAppOnlyEnabled,
  isHeroAreaPath,
  isOpenWhilePending,
  PENDING_PATH,
  readAccessClaims,
  type AccessInput,
} from "@/lib/access/gate";
import { onboardingKindAfterApproval, parseAccountAccess, parseQueue, presidencyError, profileFromStartPath } from "@/lib/access/status";
import { nativeAppFrom } from "@/lib/native-app/surface";

// 0141: aprovação da Presidência e Hero/Creator só pelo aplicativo (regras puras do middleware e das telas)

const base: AccessInput = { pathname: "/personalities", signedIn: true, claims: { status: "approved", appOnly: false }, native: false, creatorAppOnly: true };
const at = (patch: Partial<AccessInput>) => decideAccess({ ...base, ...patch });

describe("readAccessClaims", () => {
  it("lê access/app_only das claims do JWT ou do próprio app_metadata", () => {
    expect(readAccessClaims({ sub: "u", app_metadata: { access: "pending", app_only: true } })).toEqual({ status: "pending", appOnly: true, mustChangePassword: false });
    expect(readAccessClaims({ access: "approved", app_only: false })).toEqual({ status: "approved", appOnly: false, mustChangePassword: false });
  });
  it("token antigo (sem a chave) ou valor estranho = status nulo, nunca aprovado por engano", () => {
    expect(readAccessClaims({ app_metadata: { provider: "email" } })).toEqual({ status: null, appOnly: false, mustChangePassword: false });
    expect(readAccessClaims({ app_metadata: { access: "ok", app_only: "true" } })).toEqual({ status: null, appOnly: false, mustChangePassword: false });
    expect(readAccessClaims(null)).toEqual({ status: null, appOnly: false, mustChangePassword: false });
  });
});

describe("conta pendente ou recusada (aprovação da Presidência)", () => {
  it("toda área interna leva à tela de status", () => {
    for (const pathname of ["/personalities", "/agencia", "/marca/campanhas", "/profile", "/admin", "/primeiro-acesso", "/invite", "/"]) {
      expect(at({ pathname, claims: { status: "pending", appOnly: false } })).toEqual({ action: "pending", status: "pending" });
    }
    expect(at({ pathname: "/marca", claims: { status: "rejected", appOnly: false } })).toEqual({ action: "pending", status: "rejected" });
  });
  it("abre só a tela de status, os retornos do login, a recuperação de senha, textos legais e offline", () => {
    for (const pathname of [PENDING_PATH, APP_ONLY_PATH, "/auth/callback", "/auth/signout", "/reset-password", "/legal/terms", "/legal/account-deletion", "/offline"]) {
      expect(at({ pathname, claims: { status: "pending", appOnly: false } })).toEqual({ action: "next" });
    }
  });
  it("o /login só fica aberto durante a tela 'Sua senha' do cadastro rápido", () => {
    expect(isOpenWhilePending("/login")).toBe(false);
    expect(isOpenWhilePending("/login", { quickSignupPending: true })).toBe(true);
    expect(at({ pathname: "/login", claims: { status: "pending", appOnly: false }, quickSignupPending: true })).toEqual({ action: "next" });
  });
  it("aprovada entra sem nova aprovação; token antigo e visitante seguem as regras de sempre", () => {
    expect(at({ pathname: "/agencia" })).toEqual({ action: "next" });
    expect(at({ pathname: "/agencia", claims: { status: null, appOnly: false } })).toEqual({ action: "next" });
    expect(at({ pathname: "/agencia", signedIn: false, claims: { status: null, appOnly: false } })).toEqual({ action: "next" });
  });
});

describe("Hero/Creator só pelo aplicativo", () => {
  const hero = { status: "approved", appOnly: true } as const;
  it("conta Hero no navegador: sessão encerrada e mensagem do app, em qualquer rota (URL direta e sessão antiga)", () => {
    for (const pathname of ["/heroi", "/heroi/oportunidades/1", "/personalities", "/profile", "/"]) {
      expect(at({ pathname, claims: hero })).toEqual({ action: "app-only", signOut: true, redirect: true });
    }
    // já na mensagem: só encerra a sessão, sem redirecionar de novo
    expect(at({ pathname: APP_ONLY_PATH, claims: hero })).toEqual({ action: "app-only", signOut: true, redirect: false });
  });
  it("vale também para o Hero ainda pendente (no navegador nem a tela de status)", () => {
    expect(at({ pathname: PENDING_PATH, claims: { status: "pending", appOnly: true } })).toEqual({ action: "app-only", signOut: true, redirect: true });
  });
  it("no aplicativo o Hero segue normal (aprovado entra; pendente vê o status)", () => {
    expect(at({ pathname: "/heroi", claims: hero, native: true })).toEqual({ action: "next" });
    expect(at({ pathname: "/heroi", claims: { status: "pending", appOnly: true }, native: true })).toEqual({ action: "pending", status: "pending" });
  });
  it("retornos do login (/auth, inclusive o /auth/native no navegador do sistema) e a recuperação de senha nunca são barrados", () => {
    for (const pathname of ["/auth/native", "/auth/callback", "/auth/signout", "/reset-password"]) {
      expect(at({ pathname, claims: hero })).toEqual({ action: "next" });
    }
  });
  it("cadastro de Hero no navegador fecha para qualquer um; a área do Hero sem sessão vai direto para a mensagem", () => {
    expect(at({ pathname: "/comecar/heroi" })).toEqual({ action: "app-only", signOut: false, redirect: true });
    expect(at({ pathname: "/heroi/agenda", signedIn: false, claims: { status: null, appOnly: false } })).toEqual({ action: "app-only", signOut: false, redirect: true });
    // outro perfil com sessão (ex.: admin supervisionando) passa: o portal confere o papel
    expect(at({ pathname: "/heroi" })).toEqual({ action: "next" });
    expect(isHeroAreaPath("/heroina")).toBe(false);
  });
  it("Marca, Agência e usuário comum seguem na web", () => {
    for (const pathname of ["/marca", "/agencia/aprovacoes", "/personalities", "/comecar/marca"]) {
      expect(at({ pathname })).toEqual({ action: "next" });
    }
  });
  it("canal do app: marca do user agent ou, sem ela (service worker do Android), o cookie gravado pelo servidor", () => {
    expect(nativeAppFrom("Mozilla/5.0 (Linux; Android 14; wv) GCHeroApp/1.2.0 (android)", undefined)).toEqual({ platform: "android", version: "1.2.0" });
    expect(nativeAppFrom("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 Version/4.0 Chrome/120 Mobile Safari/537.36", "android")).toEqual({ platform: "android", version: "0" });
    expect(nativeAppFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", "ios")).toEqual({ platform: "ios", version: "0" });
    expect(nativeAppFrom("Mozilla/5.0 (Windows NT 10.0) Chrome/120", undefined)).toBeNull();
    expect(nativeAppFrom("Mozilla/5.0 (Windows NT 10.0) Chrome/120", "desktop")).toBeNull();
  });
  it("cookie do canal copiado para um navegador comum (com a sessão) não vale como app", () => {
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    ]) {
      expect(nativeAppFrom(ua, "ios")).toBeNull();
      expect(nativeAppFrom(ua, "android")).toBeNull();
    }
  });
  it("WebView do Android sem a marca não perde a sessão (só o redirecionamento)", () => {
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 Chrome/120 Mobile")).toBe(true);
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile")).toBe(false);
    expect(isAndroidWebView("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(false);
    expect(isAndroidWebView(null)).toBe(false);
  });
  it("válvula: CREATOR_APP_ONLY=false desliga a regra; ausente ou qualquer outro valor mantém ligada", () => {
    expect(isCreatorAppOnlyEnabled(undefined)).toBe(true);
    expect(isCreatorAppOnlyEnabled("true")).toBe(true);
    expect(isCreatorAppOnlyEnabled(" FALSE ")).toBe(false);
    expect(at({ pathname: "/heroi", claims: hero, creatorAppOnly: false })).toEqual({ action: "next" });
  });
});

describe("situação do cadastro e fila", () => {
  it("interpreta account_access_status", () => {
    expect(
      parseAccountAccess({ status: "pending", requested_profile: "brand", profile_confirmed: false, origin: "google", requested_at: "2026-11-11T10:00:00Z", app_only: false, email: "a@b.c", name: "Ana" }),
    ).toEqual({ status: "pending", requestedProfile: "brand", profileConfirmed: false, origin: "google", requestedAt: "2026-11-11T10:00:00Z", decidedAt: null, appOnly: false, email: "a@b.c", name: "Ana" });
    expect(parseAccountAccess({ status: "talvez" })).toBeNull();
    expect(parseAccountAccess(null)).toBeNull();
  });
  it("interpreta a fila e descarta linhas sem id", () => {
    const items = parseQueue([
      { user_id: "u1", email: "x@y.z", requested_profile: "hero", origin: "invite", status: "pending" },
      { email: "sem-id" },
      "lixo",
      { user_id: "u2", email: "g@y.z", origin: "google", status: "pending", email_verified: true },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ userId: "u1", requestedProfile: "hero", origin: "invite", status: "pending", profileConfirmed: true, emailVerified: false });
    expect(items[1]).toMatchObject({ userId: "u2", origin: "google", emailVerified: true });
    expect(parseQueue({})).toEqual([]);
  });
  it("erros do banco viram chaves de tradução", () => {
    expect(presidencyError("forbidden")).toBe("forbidden");
    expect(presidencyError("cannot_decide_self")).toBe("cannot_decide_self");
    expect(presidencyError("profile_changed")).toBe("profile_changed");
    // 0144: outro aprovador decidiu enquanto a tela estava aberta (não confunde com "já aprovado")
    expect(presidencyError("already_decided")).toBe("already_decided");
    expect(presidencyError("already_approved")).toBe("already_approved");
    expect(presidencyError("algo novo")).toBe("unknown");
  });
  it("depois da aprovação: perfil de negócio abre o passo a passo; usuário do app vai direto", () => {
    expect(onboardingKindAfterApproval("brand")).toBe("brand");
    expect(onboardingKindAfterApproval("hero")).toBe("hero");
    expect(onboardingKindAfterApproval("consumer")).toBeNull();
    expect(onboardingKindAfterApproval("staff")).toBeNull();
  });
  it("volta do Google com o perfil escolhido na entrada", () => {
    expect(profileFromStartPath("/comecar/marca")).toBe("brand");
    expect(profileFromStartPath("/comecar/heroi?x=1")).toBe("hero");
    expect(profileFromStartPath("/comecar/agencia")).toBe("agency");
    expect(profileFromStartPath("/comecar/app")).toBeNull();
    expect(profileFromStartPath("/personalities")).toBeNull();
  });
});
