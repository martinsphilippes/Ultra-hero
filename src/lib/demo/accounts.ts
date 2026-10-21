// Contas de demonstração, uma por tipo de acesso (criadas no banco com app_metadata.ultra_hero_demo).
// Módulo puro: a senha e o código ficam só em variáveis de ambiente do servidor.
// Pedido do responsável: acesso rápido na tela inicial enquanto o app é um experimento; remover antes
// de abrir para o público (apagar DEMO_ACCOUNTS_PASSWORD e DEMO_ACCESS_CODE desliga tudo).

export const DEMO_ACCOUNTS = [
  { kind: "admin", email: "admin@demo.ultrahero.app", home: "/admin" },
  { kind: "creator", email: "heroi@demo.ultrahero.app", home: "/creator" },
  { kind: "seller", email: "fornecedor@demo.ultrahero.app", home: "/seller" },
  { kind: "premium", email: "premium@demo.ultrahero.app", home: "/profile" },
  { kind: "free", email: "gratuito@demo.ultrahero.app", home: "/" },
] as const;

export type DemoKind = (typeof DEMO_ACCOUNTS)[number]["kind"];

export function demoAccount(kind: string) {
  return DEMO_ACCOUNTS.find((account) => account.kind === kind) ?? null;
}

/** Normaliza o código digitado: sem espaços e em maiúsculas (o código é gerado assim). */
export function normalizeDemoCode(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "").toUpperCase().slice(0, 64) : "";
}
