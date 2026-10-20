// Caminhos para onde não faz sentido voltar após autenticar (/reset-password é destino legítimo da recuperação).
const BLOCKED_PREFIXES = ["/auth/", "/login", "/signup", "/forgot-password"];

// Garante que `next` é um caminho relativo da mesma origem (evita open redirect).
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  // Precisa começar com uma única barra; "//host" e "/\host" seriam absolutos no navegador.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Sem caracteres de controle nem esquemas escondidos.
  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("://")) return fallback;
  if (BLOCKED_PREFIXES.some((prefix) => next === prefix.replace(/\/$/, "") || next.startsWith(prefix))) {
    return fallback;
  }
  return next;
}
