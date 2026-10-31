"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getOrigin } from "@/lib/auth/origin";
import { agencyFail } from "@/lib/agency/errors";
import { emailSchema } from "@/lib/agency/schemas";
import { AGENCY_ROLES } from "@/lib/agency/roles";
import { requireRole } from "@/lib/auth/session";
import { AGENCY_DEMO_EMAIL, AGENCY_STAFF_DEMO_EMAIL, BRAND_DEMO_EMAIL, TALENT_DEMO_EMAIL } from "@/lib/demo/accounts";
import { demoPassword } from "@/lib/demo/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// /admin/agencia: só o admin geral com conta real (is_platform_admin). A conta admin@demo recebe
// "forbidden" aqui e nas RPCs (D6).

export type AdminAgencyResult = { ok: true; message: string; id?: string; link?: string } | { ok: false; error: string };

async function platformAdmin() {
  const { user } = await requireRole("admin", "/admin/agencia");
  if ((user.app_metadata as Record<string, unknown> | undefined)?.ultra_hero_demo === true) throw new Error("forbidden");
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) throw new Error("forbidden");
  return { user, supabase };
}

const agencySchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  status: z.enum(["active", "suspended"]),
  contactEmail: z.union([z.literal(""), emailSchema]),
});

export async function saveAgencyAction(input: { id: string | null; name: string; slug: string; status: string; contactEmail: string }): Promise<AdminAgencyResult> {
  try {
    const { supabase } = await platformAdmin();
    const parsed = agencySchema.safeParse(input);
    if (!parsed.success) return agencyFail("invalid_input");
    const { data, error } = await supabase.rpc("admin_agency_save", {
      p_id: parsed.data.id,
      p_data: { name: parsed.data.name, slug: parsed.data.slug, status: parsed.data.status, contact_email: parsed.data.contactEmail },
    });
    if (error) return agencyFail(error);
    revalidatePath("/admin/agencia");
    revalidatePath("/agencia", "layout");
    const t = await getTranslations("adminAgency");
    return { ok: true, message: t("saved"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

// Convite do primeiro Adm (ou de qualquer nível) de uma agência, pelo admin geral.
export async function inviteAgencyMemberAction(input: { agencyId: string; email: string; role: string }): Promise<AdminAgencyResult> {
  try {
    const { supabase } = await platformAdmin();
    const parsed = z.object({ agencyId: z.uuid(), email: emailSchema, role: z.enum(AGENCY_ROLES) }).safeParse(input);
    if (!parsed.success) return agencyFail("invalid_input");
    const { data, error } = await supabase.rpc("agency_invite_member", { p_agency: parsed.data.agencyId, p_email: parsed.data.email, p_role: parsed.data.role });
    if (error) return agencyFail(error);
    const row = data?.[0];
    if (!row) return agencyFail("generic");
    revalidatePath("/admin/agencia");
    const t = await getTranslations("adminAgency");
    return { ok: true, message: t("inviteCreated"), link: `${await getOrigin()}/invite?token=${encodeURIComponent(row.token)}` };
  } catch (error) {
    return agencyFail(error);
  }
}

// Transferência de marca entre agências (D18): só o admin geral, arquivando o vínculo anterior.
export async function transferBrandAction(input: { agencyId: string; brandId: string }): Promise<AdminAgencyResult> {
  try {
    const { supabase } = await platformAdmin();
    const parsed = z.object({ agencyId: z.uuid(), brandId: z.uuid() }).safeParse(input);
    if (!parsed.success) return agencyFail("invalid_input");
    const { error } = await supabase.rpc("agency_brand_link", { p_agency: parsed.data.agencyId, p_brand: parsed.data.brandId, p_on: true });
    if (error) return agencyFail(error);
    revalidatePath("/admin/agencia");
    const t = await getTranslations("adminAgency");
    return { ok: true, message: t("transferred") };
  } catch (error) {
    return agencyFail(error);
  }
}

/**
 * Ambiente de demonstração (seção 8): cria (ou acha) a agência demo e as contas agencia@, colaborador@ e
 * marca@ com a senha das contas de acesso rápido (só no servidor), e grava os vínculos pela
 * agency_demo_seed (service role). Reexecutar não duplica e restaura papéis e dados de exemplo.
 */
export async function createAgencyDemoAction(): Promise<AdminAgencyResult> {
  try {
    const { user, supabase } = await platformAdmin();
    const password = demoPassword();
    if (!hasAdminClient() || !password) return agencyFail("forbidden");
    const client = createAdminClient();
    let agencyId: string | null = null;
    const { data: existing } = await client.from("agencies").select("id").eq("slug", "agencia-demo").maybeSingle();
    if (existing) agencyId = existing.id;
    else {
      const { data: created, error } = await supabase.rpc("admin_agency_save", {
        p_id: null,
        p_data: { slug: "agencia-demo", name: "Agência Exemplo (demonstração)", is_demo: true, status: "active" },
      });
      if (error || !created) return agencyFail(error ?? "generic");
      agencyId = created;
    }
    const accounts = [
      { email: AGENCY_DEMO_EMAIL, name: "Agência (demonstração)" },
      { email: AGENCY_STAFF_DEMO_EMAIL, name: "Colaborador (demonstração)" },
      { email: BRAND_DEMO_EMAIL, name: "Marca (demonstração)" },
      { email: TALENT_DEMO_EMAIL, name: "Talento Exemplo" },
    ];
    for (const account of accounts) {
      const { error } = await client.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        app_metadata: { ultra_hero_demo: true },
        user_metadata: { full_name: account.name },
      });
      // conta já existente: segue (o seed refaz os vínculos)
      if (error && !/already|registered|exists/i.test(error.message)) return agencyFail(error);
    }
    const { error: seedError } = await client.rpc("agency_demo_seed", {
      p_agency: agencyId,
      p_emails: { admin: AGENCY_DEMO_EMAIL, staff: AGENCY_STAFF_DEMO_EMAIL, brand_owner: BRAND_DEMO_EMAIL, talent: TALENT_DEMO_EMAIL },
      p_actor: user.id,
    });
    if (seedError) return agencyFail(seedError);
    // agenda de exemplo (0067): sem a migração no remoto, segue sem ela (isMissingSchema)
    // segunda campanha já em produção (0068: termos aceitos, tarefas, entregas) e agenda de exemplo (0067)
    const { error: executionError } = await client.rpc("agency_demo_seed_execution", { p_agency: agencyId, p_actor: user.id });
    if (executionError && !isMissingSchema(executionError)) return agencyFail(executionError);
    const { error: calendarError } = await client.rpc("agency_demo_seed_calendar", { p_agency: agencyId, p_actor: user.id });
    if (calendarError && !isMissingSchema(calendarError)) return agencyFail(calendarError);
    revalidatePath("/admin/agencia");
    revalidatePath("/login");
    const t = await getTranslations("adminAgency");
    return { ok: true, message: t("demoReady"), id: agencyId ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}
