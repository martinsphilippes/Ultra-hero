import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getRoles, getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Contexto do portal do fornecedor: organizações do usuário (my_seller_org_ids), organização
// ativa (cookie) e estado (ok / não vinculado / suspenso). Admin sem vínculo supervisiona.

export const SELLER_ORG_COOKIE = "uh-seller-org";

export type SellerOrg = {
  id: string;
  slug: string;
  name: string;
  kind: "own" | "partner";
  status: "pending" | "active" | "suspended";
  description: string | null;
  logo_url: string | null;
  is_fictional: boolean;
};

export type SellerContext = {
  userId: string;
  isAdmin: boolean;
  supervising: boolean;
  state: "ok" | "not_linked" | "suspended";
  orgs: SellerOrg[];
  org: SellerOrg | null;
};

const ORG_SELECT = "id, slug, name, kind, status, description, logo_url, is_fictional";

export const getSellerContext = cache(async (): Promise<SellerContext> => {
  const user = await getUser();
  if (!user) return { userId: "", isAdmin: false, supervising: false, state: "not_linked", orgs: [], org: null };
  const [roles, supabase, jar] = await Promise.all([getRoles(), createClient(), cookies()]);
  const isAdmin = roles.some((r) => r.role === "admin");

  // organizações ativas em que o usuário é membro (fonte de verdade: função SQL)
  const { data: idsRaw } = await supabase.rpc("my_seller_org_ids");
  const ids = Array.isArray(idsRaw) ? (idsRaw as string[]) : [];

  let orgs: SellerOrg[] = [];
  let supervising = false;
  if (ids.length > 0) {
    const { data } = await supabase.from("seller_organizations").select(ORG_SELECT).in("id", ids).order("name");
    orgs = (data ?? []) as SellerOrg[];
  } else if (isAdmin) {
    // admin sem vínculo: supervisão de qualquer organização ativa
    const { data } = await supabase.from("seller_organizations").select(ORG_SELECT).eq("status", "active").order("name");
    orgs = (data ?? []) as SellerOrg[];
    supervising = orgs.length > 0;
  }

  if (orgs.length === 0) {
    // vínculo existe, mas organização suspensa/pendente?
    const { data: memberships } = await supabase.from("seller_memberships").select("org_id, revoked_at").eq("user_id", user.id).is("revoked_at", null);
    const state = (memberships ?? []).length > 0 ? "suspended" : "not_linked";
    return { userId: user.id, isAdmin, supervising: false, state, orgs: [], org: null };
  }

  const cookieOrg = jar.get(SELLER_ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.id === cookieOrg) ?? orgs[0];
  return { userId: user.id, isAdmin, supervising, state: "ok", orgs, org };
});
