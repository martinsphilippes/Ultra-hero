import "server-only";

// Os botões de acesso rápido só existem quando a senha das contas de demonstração está configurada.
// Ela nunca vai para o navegador: o login acontece numa server action.

export function demoPassword(): string | null {
  const value = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
  return value ? value : null;
}

export function isDemoAccessEnabled(): boolean {
  return demoPassword() !== null;
}
