import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { HERO_DEFAULT_AVATAR } from "@/lib/avatar/constants";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "./safe-next";

export type AppRole = "consumer" | "creator" | "seller" | "admin";

export type RoleAssignment = {
  user_id: string;
  role: AppRole;
  scope_type: "global" | "seller_org" | "creator";
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

// Usuário autenticado (validado no servidor de auth), memoizado por request.
export const getUser = cache(async (): Promise<User | null> => {
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
  // herói ativo sem avatar: a ilustração da página pública, não a sorteada pelo nome (um avatar só)
  const heroDefault = !profile?.avatar_url && (await isActiveHero(user.id, roleNames)) ? HERO_DEFAULT_AVATAR : null;
  const avatarUrl = profile?.avatar_url || heroDefault || (typeof meta?.avatar_url === "string" ? meta.avatar_url : null);
  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
    avatarUrl,
    roles: Array.from(new Set(roleNames)),
  };
}

// Mesma regra do /profile (heroProfileFor + my_creator_id): papel de herói (ou admin) e perfil
// vinculado ativo. Só consulta quando o papel existe; erro de leitura conta como "não".
async function isActiveHero(userId: string, roles: AppRole[]): Promise<boolean> {
  if (!roles.includes("creator") && !roles.includes("admin")) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("creator_profiles").select("id").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  return !error && data !== null;
}
