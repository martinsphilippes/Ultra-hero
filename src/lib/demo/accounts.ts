// Contas de demonstração, uma por tipo de acesso (criadas no banco com app_metadata.ultra_hero_demo).
// Módulo puro: a senha fica só na variável de ambiente do servidor (DEMO_ACCOUNTS_PASSWORD).
// Pedido do responsável: acesso direto, sem código, na tela de login e no Início enquanto o app é um
// experimento. Apagar DEMO_ACCOUNTS_PASSWORD na Vercel desliga os botões; remover antes de abrir ao público.

export const DEMO_ACCOUNTS = [
  { kind: "admin", email: "admin@demo.ultrahero.app", home: "/admin" },
  { kind: "creator", email: "heroi@demo.ultrahero.app", home: "/creator" },
  { kind: "seller", email: "fornecedor@demo.ultrahero.app", home: "/seller" },
  { kind: "premium", email: "premium@demo.ultrahero.app", home: "/profile" },
  { kind: "free", email: "gratuito@demo.ultrahero.app", home: "/explore" },
] as const;

export type DemoKind = (typeof DEMO_ACCOUNTS)[number]["kind"];

/** Telas onde o painel aparece; o erro de login volta para a mesma tela. */
export const DEMO_ORIGINS = { login: "/login", home: "/" } as const;
export type DemoOrigin = keyof typeof DEMO_ORIGINS;

export function demoAccount(kind: string) {
  return DEMO_ACCOUNTS.find((account) => account.kind === kind) ?? null;
}

export function demoOrigin(value: unknown): DemoOrigin {
  return value === "login" ? "login" : "home";
}
