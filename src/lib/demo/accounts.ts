import { visibleDemoKinds } from "@/lib/seller-ops/portal";

// Contas de demonstração, uma por tipo de acesso (criadas no banco com app_metadata.ultra_hero_demo).
// Módulo puro: a senha fica só na variável de ambiente do servidor (DEMO_ACCOUNTS_PASSWORD).
// Pedido do responsável: acesso direto, sem código, na tela de login e no fim do Perfil (trocar de
// conta; saiu do Início) enquanto o app é um experimento. Apagar DEMO_ACCOUNTS_PASSWORD na Vercel desliga os botões; remover antes de abrir ao público.

// Todas entram direto na aba Hero (pedido do responsável); os portais ficam a um toque no Perfil.
export const DEMO_ACCOUNTS = [
  { kind: "admin", email: "admin@demo.ultrahero.app", home: "/personalities" },
  { kind: "creator", email: "heroi@demo.ultrahero.app", home: "/personalities" },
  { kind: "seller", email: "fornecedor@demo.ultrahero.app", home: "/personalities" },
  { kind: "premium", email: "premium@demo.ultrahero.app", home: "/personalities" },
  { kind: "free", email: "gratuito@demo.ultrahero.app", home: "/personalities" },
  // profissional de exemplo (0058): a conta é criada pelo admin em /admin/professionals/<id>
  { kind: "professional", email: "profissional@demo.ultrahero.app", home: "/personalities" },
  // gestão (0064): agência de demonstração (Adm e colaborador) e a marca fictícia; criadas pelo admin
  // geral em /admin/agencia (botão "Ambiente de demonstração"), nunca por migração
  { kind: "agency", email: "agencia@demo.ultrahero.app", home: "/personalities" },
  { kind: "agencyStaff", email: "colaborador@demo.ultrahero.app", home: "/personalities" },
  { kind: "brand", email: "marca@demo.ultrahero.app", home: "/personalities" },
  // casting (0065): talento sem página pública da agência de demonstração (escritório do creator)
  { kind: "talent", email: "talento@demo.ultrahero.app", home: "/personalities" },
] as const;

/** Conta de acesso rápido do profissional de exemplo (criada pelo admin, com a senha das demais). */
export const PROFESSIONAL_DEMO_EMAIL = "profissional@demo.ultrahero.app";

/** Contas da agência de demonstração (seção 8 da spec de gestão). */
export const AGENCY_DEMO_EMAIL = "agencia@demo.ultrahero.app";
export const AGENCY_STAFF_DEMO_EMAIL = "colaborador@demo.ultrahero.app";
export const BRAND_DEMO_EMAIL = "marca@demo.ultrahero.app";
export const TALENT_DEMO_EMAIL = "talento@demo.ultrahero.app";

export type DemoKind = (typeof DEMO_ACCOUNTS)[number]["kind"];

// Painel de acesso rápido: sem o portal do fornecedor (SELLER_PORTAL_ENABLED), a conta do fornecedor
// sai do painel e não entra pelo atalho. A conta continua no banco (DEMO_ACCOUNTS segue completo).
const ACCESS_KINDS = visibleDemoKinds(DEMO_ACCOUNTS.map((a) => a.kind));
export const DEMO_ACCESS_ACCOUNTS = DEMO_ACCOUNTS.filter((a) => ACCESS_KINDS.includes(a.kind));

/**
 * Contas que dependem de algo no banco: a do profissional só aparece depois que o admin cria a conta
 * (sem a 0058, ou antes disso, o botão daria erro de login).
 */
export type DemoReadiness = { professional: boolean; agency?: boolean; agencyStaff?: boolean; brand?: boolean; talent?: boolean };

export function readyDemoAccounts<A extends { kind: string }>(accounts: readonly A[], ready: DemoReadiness): A[] {
  const flags: Record<string, boolean> = {
    professional: ready.professional,
    agency: ready.agency ?? false,
    agencyStaff: ready.agencyStaff ?? false,
    brand: ready.brand ?? false,
    talent: ready.talent ?? false,
  };
  return accounts.filter((a) => !(a.kind in flags) || flags[a.kind]);
}

/** Telas onde o painel aparece; o erro de login volta para a mesma tela. */
export const DEMO_ORIGINS = { login: "/login", profile: "/profile" } as const;
export type DemoOrigin = keyof typeof DEMO_ORIGINS;

export function demoAccount(kind: string) {
  return DEMO_ACCESS_ACCOUNTS.find((account) => account.kind === kind) ?? null;
}

export function demoOrigin(value: unknown): DemoOrigin {
  return value === "login" ? "login" : "profile";
}
