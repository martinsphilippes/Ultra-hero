"use server";

import { headers } from "next/headers";
import { clientIp, hashForRateLimit, isMissingSchema, recordQuickSignupAttempt } from "@/lib/auth/quick-signup-server";
import { cleanTag, LAUNCH_HONEYPOT_FIELD, LAUNCH_LEAD_LIMITS, launchLeadFieldErrors, launchLeadSchema, shortUserAgent, type LaunchLeadState } from "@/lib/launch-leads";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// "Seja o primeiro a saber" (teaser de lançamento, 0117). Grava em launch_leads pelo service role: a tabela não tem
// acesso nenhum pela API. Ordem: campo-isca → validação → limite por IP/e-mail (HMAC, prefixo "launch:") → upsert
// por (email, kind) — repetir o e-mail atualiza sem erro. Nunca registre nome, e-mail, celular ou IP em log.
export async function joinLaunchListAction(_prev: LaunchLeadState, formData: FormData): Promise<LaunchLeadState> {
  // robô preencheu o campo-isca: responde "pronto" sem gravar nada (sem pista do motivo)
  const honeypot = formData.get(LAUNCH_HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") return { status: "ok" };

  const kind = formData.get("kind");
  const parsed = launchLeadSchema.safeParse({
    kind,
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    consent: formData.get("consent"),
    // o @ só existe na porta do influenciador; no público é ignorado
    instagram: kind === "influenciador" ? formData.get("instagram") : null,
  });
  if (!parsed.success) {
    const fieldErrors = launchLeadFieldErrors(parsed.error);
    return Object.keys(fieldErrors).length ? { status: "error", fieldErrors } : { status: "error", error: "unknown" };
  }
  const lead = parsed.data;

  if (!hasAdminClient()) return { status: "error", error: "unavailable" };
  const admin = createAdminClient();
  const headerStore = await headers();
  const ipHash = hashForRateLimit("ip", `launch:${clientIp(headerStore)}`);
  const attempt = await recordQuickSignupAttempt(admin, ipHash, hashForRateLimit("email", `launch:${lead.email}`), LAUNCH_LEAD_LIMITS);
  if (attempt === "limited") return { status: "error", error: "tooMany" };
  if (attempt !== "ok") return { status: "error", error: "unavailable" };

  const now = new Date().toISOString();
  const { error } = await admin.from("launch_leads").upsert(
    {
      kind: lead.kind,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      // sem @ desta vez: mantém o que já estava (o upsert só atualiza as colunas enviadas)
      ...(lead.instagram ? { instagram: lead.instagram } : {}),
      consent_at: now,
      source: cleanTag(formData.get("source")),
      utm_source: cleanTag(formData.get("utm_source")),
      utm_medium: cleanTag(formData.get("utm_medium")),
      utm_campaign: cleanTag(formData.get("utm_campaign"), 120),
      ip_hash: ipHash,
      user_agent: shortUserAgent(headerStore.get("user-agent")),
    },
    { onConflict: "email,kind" },
  );
  if (error) {
    console.warn("[launch-leads] não gravou:", isMissingSchema(error) ? "schema_missing" : (error.code ?? "erro"));
    return { status: "error", error: "unavailable" };
  }
  return { status: "ok" };
}
