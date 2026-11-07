import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OndaArea, OndaMetric, OndaStatus } from "./format";

// Onda Digital (0132): conteúdo da página (perfis, portais, cases e ondas) e os pedidos da marca.

export type OndaProfile = { id: string; network: "instagram" | "x"; handle: string; followers: number; avatar_url: string | null };
export type OndaPortal = { area: OndaArea; name: string };
export type OndaCase = { id: string; brand: string; logo_url: string | null; category: string | null; description: string; metrics: OndaMetric[] };
export type OndaPackage = { slug: string; name: string; scope: string; description: string };
export type OndaContent = {
  profiles: OndaProfile[];
  portals: OndaPortal[];
  cases: OndaCase[];
  packages: OndaPackage[];
  /** Mês da última atualização dos seguidores de cada rede (0134). */
  updated: { instagram: string | null; x: string | null };
};

export type OndaAdminProfile = OndaProfile & { active: boolean; updated_at: string };
export type OndaAdminCase = OndaCase & { active: boolean };
export type OndaAdminPackage = OndaPackage & { active: boolean };
export type OndaAdminContent = { profiles: OndaAdminProfile[]; cases: OndaAdminCase[]; packages: OndaAdminPackage[] };

export type OndaRequestRow = {
  id: string;
  package: string | null;
  purpose: string;
  when_kind: string;
  when_date: string | null;
  subject: string;
  status: OndaStatus;
  created_at: string;
};

export type OndaInboxItem = OndaRequestRow & {
  brand_id: string;
  brand: string;
  logo_url: string | null;
  budget_cents: number | null;
  profiles: string[];
  deal_id: string | null;
  requested_by: string;
  email: string | null;
};

const EMPTY: OndaContent = { profiles: [], portals: [], cases: [], packages: [], updated: { instagram: null, x: null } };

export async function loadOndaContent(): Promise<OndaContent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onda_content");
  if (error || !data || typeof data !== "object") return null;
  const d = data as Partial<OndaContent>;
  return {
    profiles: Array.isArray(d.profiles) ? d.profiles : EMPTY.profiles,
    portals: Array.isArray(d.portals) ? d.portals : EMPTY.portals,
    cases: Array.isArray(d.cases) ? d.cases : EMPTY.cases,
    packages: Array.isArray(d.packages) ? d.packages : EMPTY.packages,
    updated: {
      instagram: typeof d.updated?.instagram === "string" ? d.updated.instagram : null,
      x: typeof d.updated?.x === "string" ? d.updated.x : null,
    },
  };
}

/** Tudo da Onda Digital para o editor da Groscove (inclusive o que está fora da página). */
export async function loadOndaAdminContent(): Promise<OndaAdminContent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onda_admin_content");
  if (error || !data || typeof data !== "object") return null;
  const d = data as Partial<OndaAdminContent>;
  return {
    profiles: Array.isArray(d.profiles) ? d.profiles : [],
    cases: Array.isArray(d.cases) ? d.cases : [],
    packages: Array.isArray(d.packages) ? d.packages : [],
  };
}

/** Pedidos da marca (a RLS só devolve os da própria marca). */
export async function listBrandOndaRequests(brandId: string): Promise<OndaRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onda_requests")
    .select("id, package, purpose, when_kind, when_date, subject, status, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data as OndaRequestRow[];
}

/** Pedidos de todas as marcas, para a Groscove (a função recusa quem não é da Groscove). */
export async function listOndaInbox(): Promise<OndaInboxItem[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onda_request_inbox");
  if (error) return null;
  return Array.isArray(data) ? (data as OndaInboxItem[]) : [];
}
