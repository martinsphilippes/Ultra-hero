import "server-only";
import { cache } from "react";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Os botões de acesso rápido só existem quando a senha das contas de demonstração está configurada.
// Ela nunca vai para o navegador: o login acontece numa server action.

export function demoPassword(): string | null {
  const value = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
  return value ? value : null;
}

export function isDemoAccessEnabled(): boolean {
  return demoPassword() !== null;
}

/** O profissional de exemplo já tem a conta de acesso rápido? (0058; service role, sem dado pessoal) */
export const isProfessionalDemoReady = cache(async (): Promise<boolean> => {
  if (!hasAdminClient()) return false;
  try {
    const { data, error } = await createAdminClient().from("professionals").select("id").eq("is_demo", true).not("user_id", "is", null).limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
});
