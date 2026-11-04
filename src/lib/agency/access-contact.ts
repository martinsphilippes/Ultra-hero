import { z } from "zod";
import { normalizeBrMobile } from "@/lib/auth/phone";

// Contato e acesso de quem a agência cadastra (0112): o herói (talento do Casting) e o contato da marca. Lógica pura
// (testável): o servidor valida de novo com o schema e o banco confere outra vez (access_contact_check).

export const ACCESS_KINDS = ["talent", "brand"] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

/** E-mail: sem espaços nas pontas e minúsculo; null se não parece e-mail. */
export function normalizeAccessEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export const accessEmailSchema = z.string().transform((value, ctx) => {
  const email = normalizeAccessEmail(value);
  if (!email) {
    ctx.addIssue({ code: "custom", message: "invalid_email" });
    return z.NEVER;
  }
  return email;
});

/** Celular BR → E.164 (+55DD9XXXXXXXX); a tela usa a máscara "(11) 91234-5678". */
export const accessPhoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizeBrMobile(value);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "invalid_phone" });
    return z.NEVER;
  }
  return phone;
});

export const contactNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(2, { message: "name_required" }).max(80, { message: "name_required" }));

/** Primeiro código de erro do contato (para a mensagem traduzida em agency.errors). */
export function accessErrorCode(error: z.ZodError): "invalid_email" | "invalid_phone" | "name_required" | "invalid_input" {
  for (const issue of error.issues) {
    if (issue.message === "invalid_email" || issue.message === "invalid_phone" || issue.message === "name_required") return issue.message;
  }
  return "invalid_input";
}

/** Situação do acesso (agency_access_status). */
export const ACCESS_STATES = ["active", "pending", "expired", "none"] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

export type AccessStatus = {
  targetId: string;
  creatorId: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  state: AccessState;
  inviteExpiresAt: string | null;
  loginEmail: string | null;
};

export function toAccessState(value: unknown): AccessState {
  return typeof value === "string" && (ACCESS_STATES as readonly string[]).includes(value) ? (value as AccessState) : "none";
}

/** Resultado das RPCs que ligam ou convidam: "linked" (conta existente ligada), "invited" (link novo), etc. */
export type AccessProvision = { account: "linked" | "invited" | "active" | "pending"; token?: string; expiresAt?: string };

export function parseAccessProvision(raw: unknown): AccessProvision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const account = r.account;
  if (account !== "linked" && account !== "invited" && account !== "active" && account !== "pending") return null;
  if (account === "invited" && (typeof r.token !== "string" || !/^[0-9a-f]{64}$/.test(r.token))) return null;
  return {
    account,
    ...(typeof r.token === "string" ? { token: r.token } : {}),
    ...(typeof r.expires_at === "string" ? { expiresAt: r.expires_at } : {}),
  };
}

/** Validade do convite de acesso (dias), igual ao banco. */
export const ACCESS_INVITE_DAYS = 14;

/** Endereço da página: o mesmo formato do banco (talent_page_create). */
export function slugifyHeroName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
