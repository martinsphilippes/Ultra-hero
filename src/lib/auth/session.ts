import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "./safe-next";
import { isTalentOnly } from "./talent-scope";

export type AppRole = "consumer" | "creator" | "seller" | "admin" | "professional" | "agency" | "brand";

export type RoleAssignment = {
  user_id: string;
  role: AppRole;
  scope_type: "global" | "seller_org" | "creator" | "professional" | "agency" | "brand" | "talent";
  scope_id: string | null;
  revoked_at: string | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: "pt-BR" | "en" | "es" | null;
  theme: "dark" | "light" | "system";
  timezone: string | null;
  onboarding_completed: boolean;
};

// Usuário autenticado, memoizado por request. Velocidade: confere a assinatura do JWT localmente (getClaims, chave
// pública ES256 do projeto, guardada em memória) em vez de ir ao servidor de auth a cada tela — é o mesmo token em que
// o banco confia para o RLS. Traz id, e-mail, telefone e metadados (o que vem no token). Para dados que só o servidor
// de auth tem (identidades/provedores, último login), use getFreshUser.
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (error || !c?.sub) return null;
  return {
    id: c.sub,
    aud: typeof c.aud === "string" ? c.aud : "authenticated",
    role: typeof c.role === "string" ? c.role : undefined,
    email: typeof c.email === "string" ? c.email : undefined,
    phone: typeof c.phone === "string" ? c.phone : undefined,
    app_metadata: (c.app_metadata ?? {}) as User["app_metadata"],
    user_metadata: (c.user_metadata ?? {}) as User["user_metadata"],
    is_anonymous: Boolean(c.is_anonymous),
    created_at: "",
  } as User;
});

// Usuário completo, validado no servidor de auth (identidades, último login). Mais lento: só onde precisa.
export const getFreshUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

// Perfil público do usuário atual (public.profiles).
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, locale, theme, timezone, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});

// Papéis ativos (não revogados) do usuário atual.
export const getRoles = cache(async (): Promise<RoleAssignment[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("user_id, role, scope_type, scope_id, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  return (data as RoleAssignment[] | null) ?? [];
});

/** Creator só com escopo de talento (sem página pública de Hero): o /heroi leva ao escritório (Etapa B). */

export async function hasRole(role: AppRole): Promise<boolean> {
  const roles = await getRoles();
  return roles.some((r) => r.role === role);
}

// Exige sessão; sem ela redireciona para /login?next=...
export async function requireUser(next?: string): Promise<User> {
  const user = await getUser();
  if (user) return user;
  const target = safeNext(next);
  redirect(target === "/" ? "/login" : `/login?next=${encodeURIComponent(target)}`);
}

// Exige papel. Admin passa em qualquer portal (supervisão). Sem papel: volta ao app.
export async function requireRole(role: Exclude<AppRole, "consumer">, next?: string): Promise<{ user: User; roles: RoleAssignment[] }> {
  const user = await requireUser(next);
  const roles = await getRoles();
  const allowed = roles.some((r) => r.role === role || r.role === "admin");
  if (!allowed) redirect("/");
  return { user, roles };
}

// Resumo leve para passar a componentes de layout.
export type SessionSummary = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  roles: AppRole[];
};

export async function getSessionSummary(): Promise<SessionSummary | null> {
  const user = await getUser();
  if (!user) return null;
  const [profile, roles] = await Promise.all([getProfile(), getRoles()]);
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    profile?.display_name ||
    (typeof meta?.full_name === "string" ? meta.full_name : null) ||
    (typeof meta?.name === "string" ? meta.name : null) ||
    user.email?.split("@")[0] ||
    "";
  const roleNames = roles.map((r) => r.role);
  // só foto real; sem foto o menu mostra as iniciais (o Avatar também ignora ilustração antiga)
  const avatarUrl = profile?.avatar_url || (typeof meta?.avatar_url === "string" ? meta.avatar_url : null);
  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
    avatarUrl,
    roles: Array.from(new Set(roleNames)),
  };
}

export { isTalentOnly };
