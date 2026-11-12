// Regras de acesso do site (0141, pedido de 11/11/2026). Módulo puro: usado pelo middleware, pelas páginas e pelos testes.
//
// 1) Aprovação da Presidência: toda conta nova nasce "pendente" no banco (gatilho em auth.users) e o token traz
//    app_metadata.access. Pendente ou recusada só vê a tela de status; o resto do site leva para lá (e a API do banco
//    já responde 403 pela trava pre-request da 0141).
// 2) Hero/Creator só pelo aplicativo: o token traz app_metadata.app_only. No navegador, conta Hero é desconectada e vê a
//    mensagem do app; a área do Hero (/heroi, /comecar/heroi) também não abre no navegador para ninguém.
//    O canal "aplicativo" é a WebView da casca das lojas, que se identifica no user agent (lib/native-app/surface).

export type AccessStatus = "pending" | "approved" | "rejected";

/** O que o token diz da conta. status null = token emitido antes da 0141 (sem a chave). */
export type AccessClaims = { status: AccessStatus | null; appOnly: boolean };

/** Tela de status do cadastro ("Seu cadastro está aguardando aprovação da Presidência"). */
export const PENDING_PATH = "/aguardando-aprovacao";
/** Mensagem "O acesso de Creators é exclusivo pelo aplicativo Ultra Hero". */
export const APP_ONLY_PATH = "/acesso-pelo-app";

const STATUSES: readonly AccessStatus[] = ["pending", "approved", "rejected"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Lê access/app_only de app_metadata (claims do JWT ou user.app_metadata). */
export function readAccessClaims(source: unknown): AccessClaims {
  const record = asRecord(source);
  // aceita tanto as claims inteiras ({ app_metadata: {...} }) quanto o próprio app_metadata
  const meta = asRecord(record?.app_metadata) ?? record;
  const raw = meta?.access;
  const status = typeof raw === "string" && (STATUSES as readonly string[]).includes(raw) ? (raw as AccessStatus) : null;
  return { status, appOnly: meta?.app_only === true };
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Área do Hero/Creator: o portal /heroi e o começo do cadastro de Hero para quem já tem conta (/comecar/heroi). */
export function isHeroAreaPath(pathname: string): boolean {
  return matches(pathname, "/heroi") || isHeroSignupPath(pathname);
}

/** Começo do cadastro de Hero para quem já tem conta: no navegador, fechado para todos. */
export function isHeroSignupPath(pathname: string): boolean {
  return matches(pathname, "/comecar/heroi");
}

/** Rotas de API do site (resposta em JSON, não redirecionamento). */
export function isApiPath(pathname: string): boolean {
  return matches(pathname, "/api");
}

// Conta pendente ou recusada: só a tela de status, os retornos do login (/auth: callback, confirmação, sair), a troca de
// senha pela recuperação, os textos legais e a tela sem conexão. O /login só enquanto a tela "Sua senha" do cadastro
// rápido está aberta (a senha gerada aparece uma vez).
const OPEN_WHILE_PENDING = [PENDING_PATH, APP_ONLY_PATH, "/auth", "/reset-password", "/legal", "/offline"];

export function isOpenWhilePending(pathname: string, opts: { quickSignupPending?: boolean } = {}): boolean {
  if (opts.quickSignupPending && pathname === "/login") return true;
  return OPEN_WHILE_PENDING.some((prefix) => matches(pathname, prefix));
}

export type AccessDecision =
  | { action: "next" }
  /** página → tela de status; API → 403 */
  | { action: "pending"; status: "pending" | "rejected" }
  /** página → mensagem do app (redirect=false quando já está nela); signOut = encerrar a sessão do navegador */
  | { action: "app-only"; signOut: boolean; redirect: boolean };

export type AccessInput = {
  pathname: string;
  signedIn: boolean;
  claims: AccessClaims;
  /** requisição veio do aplicativo das lojas (user agent da casca) */
  native: boolean;
  /** regra "Creator só pelo aplicativo" ligada (CREATOR_APP_ONLY, padrão ligado) */
  creatorAppOnly: boolean;
  quickSignupPending?: boolean;
};

export function decideAccess(input: AccessInput): AccessDecision {
  const { pathname, signedIn, claims, native, creatorAppOnly } = input;

  // 1) Hero/Creator no navegador: nem a área nem a conta (vale antes da aprovação: no navegador não há cadastro de Hero).
  //    /auth/* nunca é barrado aqui: é o retorno dos logins (o /auth/native roda no navegador do sistema durante o login
  //    do app) e a saída; o /auth/callback confere o Hero depois de abrir a sessão.
  //    A troca de senha pela recuperação (/reset-password) também fica livre: o link do e-mail abre no navegador.
  if (creatorAppOnly && !native && !matches(pathname, "/auth") && !matches(pathname, "/reset-password")) {
    if (signedIn && claims.appOnly) return { action: "app-only", signOut: true, redirect: pathname !== APP_ONLY_PATH };
    // cadastro de Hero: fechado no navegador para qualquer um
    if (isHeroSignupPath(pathname)) return { action: "app-only", signOut: false, redirect: true };
    // área do Hero sem sessão: direto para a mensagem do app (com sessão de outro perfil, o portal confere o papel; o admin
    // continua supervisionando pela web)
    if (!signedIn && isHeroAreaPath(pathname)) return { action: "app-only", signOut: false, redirect: true };
  }

  // 2) Conta aguardando a Presidência (ou recusada): só a tela de status
  if (signedIn && (claims.status === "pending" || claims.status === "rejected")) {
    if (isOpenWhilePending(pathname, { quickSignupPending: input.quickSignupPending })) return { action: "next" };
    return { action: "pending", status: claims.status };
  }

  return { action: "next" };
}

/**
 * WebView do Android sem a marca do app (ex.: navegação refeita pelo service worker, que no Android usa o user agent padrão).
 * Nesse caso a conta Hero é barrada, mas a sessão não é revogada: pode ser o próprio app, e a tela da mensagem se recupera.
 */
export function isAndroidWebView(userAgent: string | null | undefined): boolean {
  return /; wv\)/.test(userAgent ?? "");
}

/** Regra "Creator só pelo aplicativo" ligada? Ligada por padrão; CREATOR_APP_ONLY=false desliga (válvula de segurança). */
export function isCreatorAppOnlyEnabled(value: string | undefined = process.env.CREATOR_APP_ONLY): boolean {
  return (value ?? "").trim().toLowerCase() !== "false";
}
