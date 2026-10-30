import { visibleDemoKinds } from "@/lib/seller-ops/portal";

// Contas de demonstração, uma por tipo de acesso (criadas no banco com app_metadata.ultra_hero_demo).
// Módulo puro: a senha fica só na variável de ambiente do servidor (DEMO_ACCOUNTS_PASSWORD).
// Pedido do responsável: acesso direto, sem código, na tela de login e no Início enquanto o app é um
// experimento. Apagar DEMO_ACCOUNTS_PASSWORD na Vercel desliga os botões; remover antes de abrir ao público.

// Todas entram direto na aba Hero (pedido do responsável); os portais ficam a um toque no Perfil.
export const DEMO_ACCOUNTS = [
  { kind: "admin", email: "admin@demo.ultrahero.app", home: "/personalities" },
  { kind: "creator", email: "heroi@demo.ultrahero.app", home: "/personalities" },
  { kind: "seller", email: "fornecedor@demo.ultrahero.app", home: "/personalities" },
  { kind: "premium", email: "premium@demo.ultrahero.app", home: "/personalities" },
  { kind: "free", email: "gratuito@demo.ultrahero.app", home: "/personalities" },
] as const;

export type DemoKind = (typeof DEMO_ACCOUNTS)[number]["kind"];

// Painel de acesso rápido: sem o portal do fornecedor (SELLER_PORTAL_ENABLED), a conta do fornecedor
// sai do painel e não entra pelo atalho. A conta continua no banco (DEMO_ACCOUNTS segue completo).
const ACCESS_KINDS = visibleDemoKinds(DEMO_ACCOUNTS.map((a) => a.kind));
export const DEMO_ACCESS_ACCOUNTS = DEMO_ACCOUNTS.filter((a) => ACCESS_KINDS.includes(a.kind));

/** Telas onde o painel aparece; o erro de login volta para a mesma tela. */
export const DEMO_ORIGINS = { login: "/login", home: "/inicio" } as const;
export type DemoOrigin = keyof typeof DEMO_ORIGINS;

export function demoAccount(kind: string) {
  return DEMO_ACCESS_ACCOUNTS.find((account) => account.kind === kind) ?? null;
}

export function demoOrigin(value: unknown): DemoOrigin {
  return value === "login" ? "login" : "home";
}
