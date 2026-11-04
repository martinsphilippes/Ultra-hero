// Acesso sem senha temporário (decisão do responsável, ciente do risco, para o evento de nov/2026): entrar e
// criar conta só com o e-mail, sem senha e sem lista de permitidos, até 06/11/2026 00:00 de São Paulo. Depois
// disso volta SOZINHO ao login/cadastro com senha de sempre (nenhuma ação manual). Salvaguarda: contas de
// administrador da plataforma continuam exigindo senha. Módulo puro (testável), lido no servidor e no cliente.
//
// Variáveis de ambiente (opcionais, só no servidor):
// - PASSWORDLESS_UNTIL: data ISO que substitui o prazo padrão (ex.: 2026-11-06T03:00:00Z). Inválida = padrão.
// - PASSWORDLESS_DISABLED=1: desliga na hora (kill switch), independentemente do prazo.

/** 2026-11-06 00:00 America/Sao_Paulo (UTC−3). */
export const PASSWORDLESS_UNTIL = "2026-11-06T03:00:00Z";

/** Limite próprio do "entrar sem senha" (por IP e por e-mail, HMAC, na tabela do cadastro rápido). */
export const PASSWORDLESS_LIMITS = { windowMinutes: 10, perIp: 20, perEmail: 5 } as const;

type Env = Record<string, string | undefined>;

function readEnv(): Env {
  return typeof process !== "undefined" && process.env ? (process.env as Env) : {};
}

/** Fim do período sem senha (o override inválido é ignorado). */
export function passwordlessUntil(env: Env = readEnv()): Date {
  const override = env.PASSWORDLESS_UNTIL?.trim();
  if (override) {
    const d = new Date(override);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(PASSWORDLESS_UNTIL);
}

/** Acesso só com e-mail está valendo agora? */
export function isPasswordlessActive(now: Date = new Date(), env: Env = readEnv()): boolean {
  const disabled = env.PASSWORDLESS_DISABLED?.trim().toLowerCase();
  if (disabled === "1" || disabled === "true") return false;
  return now.getTime() < passwordlessUntil(env).getTime();
}

/** Último dia do período (dd/mm, em São Paulo) para o aviso da tela. */
export function passwordlessLastDayLabel(env: Env = readEnv()): string {
  const last = new Date(passwordlessUntil(env).getTime() - 1);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(last);
}
