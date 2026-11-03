// Regras puras dos convites (0091): papéis do convite do admin, validade, campos condicionais do formulário,
// opções enviadas à RPC admin_invite e CNPJ. Testáveis sem banco; o banco confere tudo de novo.

export const ADMIN_INVITE_ROLES = ["consumer", "admin", "agency", "brand", "creator", "hero", "seller", "professional"] as const;
export type AdminInviteRole = (typeof ADMIN_INVITE_ROLES)[number];

export const HERO_MODES = ["none", "existing", "new"] as const;
export type HeroMode = (typeof HERO_MODES)[number];
export const TEAM_MODES = ["later", "existing", "new"] as const;
export type TeamMode = (typeof TEAM_MODES)[number];

/** Papéis cuja empresa/perfil nasce no primeiro acesso (passo a passo). */
export const ONBOARDING_ROLES = ["agency", "brand", "seller", "professional"] as const;
export type OnboardingKind = (typeof ONBOARDING_ROLES)[number];

export function isAdminInviteRole(value: unknown): value is AdminInviteRole {
  return typeof value === "string" && (ADMIN_INVITE_ROLES as readonly string[]).includes(value);
}

export function isOnboardingKind(value: unknown): value is OnboardingKind {
  return typeof value === "string" && (ONBOARDING_ROLES as readonly string[]).includes(value);
}

/** Validade máxima em dias: Admin no máximo 48h (2 dias); os demais até 30. */
export function maxDaysFor(role: AdminInviteRole): number {
  return role === "admin" ? 2 : 30;
}

/** Validade padrão: 7 dias (Admin: 2 = 48h). */
export function defaultDaysFor(role: AdminInviteRole): number {
  return role === "admin" ? 2 : 7;
}

/** Ao trocar o papel, a validade digitada cai para dentro do limite do novo papel. */
export function clampDays(role: AdminInviteRole, days: number): number {
  if (!Number.isFinite(days) || days < 1) return defaultDaysFor(role);
  return Math.min(Math.trunc(days), maxDaysFor(role));
}

/** Campos condicionais do formulário do admin. */
export function adminInviteFields(role: AdminInviteRole) {
  return {
    heroLink: role === "creator",
    heroTeam: role === "hero",
    heroName: role === "hero",
    adminConfirm: role === "admin",
    onboardingNote: (ONBOARDING_ROLES as readonly string[]).includes(role),
  };
}

export type AdminInviteForm = {
  email: string;
  role: AdminInviteRole;
  days: number;
  confirmAdmin?: boolean;
  heroMode?: HeroMode;
  heroId?: string;
  heroName?: string;
  teamMode?: TeamMode;
  teamUserId?: string;
  teamEmail?: string;
};

export type AdminInviteError =
  | "email"
  | "days"
  | "admin_max_48h"
  | "admin_confirm"
  | "hero_id"
  | "hero_name"
  | "team_user"
  | "team_email";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEmail(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length <= 254 && EMAIL.test(v);
}

function heroNameOk(name: string | undefined): boolean {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  return n.length >= 2 && n.length <= 80;
}

/** Erros do formulário (vazio = pode enviar). */
export function validateAdminInvite(form: AdminInviteForm): AdminInviteError[] {
  const errors: AdminInviteError[] = [];
  if (!isEmail(form.email)) errors.push("email");
  if (!Number.isInteger(form.days) || form.days < 1 || form.days > 30) errors.push("days");
  else if (form.role === "admin" && form.days > 2) errors.push("admin_max_48h");
  if (form.role === "admin" && !form.confirmAdmin) errors.push("admin_confirm");
  if (form.role === "creator") {
    const mode = form.heroMode ?? "none";
    if (mode === "existing" && !UUID.test(form.heroId ?? "")) errors.push("hero_id");
    if (mode === "new" && !heroNameOk(form.heroName)) errors.push("hero_name");
  }
  if (form.role === "hero") {
    if (!heroNameOk(form.heroName)) errors.push("hero_name");
    const mode = form.teamMode ?? "later";
    if (mode === "existing" && !UUID.test(form.teamUserId ?? "")) errors.push("team_user");
    if (mode === "new" && (!isEmail(form.teamEmail) || form.teamEmail?.trim().toLowerCase() === form.email.trim().toLowerCase())) errors.push("team_email");
  }
  return errors;
}

/** Opções da RPC admin_invite: só o que vale para o papel escolhido. */
export function adminInviteOptions(form: AdminInviteForm): Record<string, string | boolean> {
  if (form.role === "admin") return { confirm_admin: Boolean(form.confirmAdmin) };
  if (form.role === "creator") {
    const mode = form.heroMode ?? "none";
    if (mode === "existing") return { hero_mode: mode, hero_id: form.heroId ?? "" };
    if (mode === "new") return { hero_mode: mode, hero_name: (form.heroName ?? "").trim() };
    return { hero_mode: "none" };
  }
  if (form.role === "hero") {
    const mode = form.teamMode ?? "later";
    const base = { hero_name: (form.heroName ?? "").trim(), team_mode: mode };
    if (mode === "existing") return { ...base, team_user_id: form.teamUserId ?? "" };
    if (mode === "new") return { ...base, team_email: (form.teamEmail ?? "").trim().toLowerCase() };
    return base;
  }
  return {};
}

// ---------------------------------------------------------------- CNPJ
/** Só os dígitos. */
export function cnpjDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** CNPJ com os dois dígitos verificadores (vazio não é válido; o campo é opcional em quem chama). */
export function isValidCnpj(value: string | null | undefined): boolean {
  const d = cnpjDigits(value);
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const nums = d.split("").map(Number);
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * nums[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === nums[12] && check(13) === nums[13];
}

/** 00.000.000/0000-00 (parcial enquanto digita). */
export function formatCnpj(value: string): string {
  const d = cnpjDigits(value).slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let out = parts[0];
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;
  return out;
}

// ---------------------------------------------------------------- profissional
export const PROFESSIONAL_SPECIALTIES = ["nutritionist", "personal_trainer", "physiotherapist", "psychologist"] as const;
export type ProfessionalSpecialty = (typeof PROFESSIONAL_SPECIALTIES)[number];
/** Conselho de cada especialidade (o banco deriva o mesmo). */
export const REGISTRY_BY_SPECIALTY: Record<ProfessionalSpecialty, string> = {
  nutritionist: "CRN",
  personal_trainer: "CREF",
  physiotherapist: "CREFITO",
  psychologist: "CRP",
};
export const BR_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
