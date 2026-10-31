import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isBrandRole, type BrandRole } from "@/lib/agency/roles";
import { getUser } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Contexto do portal da marca (6.3): marca, papel (dono ou equipe) e a agência que a atende.

export const BRAND_COOKIE = "uh-brand";

export type BrandSummary = { id: string; slug: string; name: string; logoUrl: string | null; siteUrl: string };

export type BrandContext =
  | { state: "unavailable" }
  | { state: "demo_forbidden" }
  | { state: "none" }
  | {
      state: "ok";
      brand: BrandSummary;
      role: BrandRole | null;
      platformAdmin: boolean;
      brands: BrandSummary[];
      agency: { id: string; name: string } | null;
    };

type BrandRow = { id: string; slug: string; name: string; logo_url: string | null; site_url: string };

const toBrand = (b: BrandRow): BrandSummary => ({ id: b.id, slug: b.slug, name: b.name, logoUrl: b.logo_url, siteUrl: b.site_url });

export const getBrandContext = cache(async (): Promise<BrandContext> => {
  const user = await getUser();
  if (!user) return { state: "none" };
  try {
    const supabase = await createClient();
    const [{ data: platformAdmin, error: adminError }, { data: demo }] = await Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.rpc("is_demo_account"),
    ]);
    if (adminError) return isMissingSchema(adminError) ? { state: "unavailable" } : { state: "none" };
    const { data: members, error } = await supabase
      .from("brand_members")
      .select("brand_id, role, brand:brands!brand_members_brand_fk(id, slug, name, logo_url, site_url)")
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if (error && isMissingSchema(error)) return { state: "unavailable" };
    type MemberRow = { brand_id: string; role: string; brand: BrandRow | null };
    const mine = ((members ?? []) as unknown as MemberRow[]).filter((m) => m.brand && isBrandRole(m.role));
    const chosen = (await cookies()).get(BRAND_COOKIE)?.value;

    let brands: BrandSummary[];
    let role: BrandRole | null = null;
    if (mine.length > 0) {
      brands = mine.map((m) => toBrand(m.brand as BrandRow));
      const pick = mine.find((m) => m.brand_id === chosen) ?? mine[0];
      role = pick.role as BrandRole;
      brands = [toBrand(pick.brand as BrandRow), ...brands.filter((b) => b.id !== pick.brand_id)];
    } else if (platformAdmin) {
      // admin geral só lê: as marcas atendidas por alguma agência
      const { data: links } = await supabase
        .from("agency_brands")
        .select("brand:brands!agency_brands_brand_fk(id, slug, name, logo_url, site_url)")
        .eq("status", "active");
      brands = ((links ?? []) as unknown as Array<{ brand: BrandRow | null }>).flatMap((l) => (l.brand ? [toBrand(l.brand)] : []));
      if (brands.length === 0) return { state: "none" };
      const pick = brands.find((b) => b.id === chosen) ?? brands[0];
      brands = [pick, ...brands.filter((b) => b.id !== pick.id)];
    } else {
      return demo ? { state: "demo_forbidden" } : { state: "none" };
    }

    const brand = brands[0];
    const { data: link } = await supabase
      .from("agency_brands")
      .select("agency:agencies!agency_brands_agency_fk(id, name)")
      .eq("brand_id", brand.id)
      .eq("status", "active")
      .maybeSingle();
    const agency = (link as unknown as { agency: { id: string; name: string } | null } | null)?.agency ?? null;
    return { state: "ok", brand, role, platformAdmin: Boolean(platformAdmin), brands, agency };
  } catch {
    return { state: "unavailable" };
  }
});

export type ReadyBrandContext = Extract<BrandContext, { state: "ok" }>;

export async function requireBrand(): Promise<ReadyBrandContext> {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") redirect("/marca");
  return ctx;
}
