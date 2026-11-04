import { z } from "zod";
import { quickSignupSchema } from "./quick-signup";

// Cadastro por perfil (0103): na primeira página a pessoa escolhe "Como você vai usar o Ultra?" — Herói, Marca,
// Agência ou só o app (consumidor, o cadastro rápido de sempre). Módulo puro (testável): perfis, endereço de cada
// um, para onde vai depois e a validação do formulário. Mensagens dos schemas = CHAVES de auth.errors.*.

/** Perfis da tela de entrada, na ordem dos cartões. */
export const SIGNUP_PROFILES = ["hero", "brand", "agency", "consumer"] as const;
export type SignupProfile = (typeof SIGNUP_PROFILES)[number];
/** Perfis com passo a passo (empresa/herói a criar): viram account_onboardings 'self'. */
export type BusinessProfile = Exclude<SignupProfile, "consumer">;
export const BUSINESS_PROFILES = ["hero", "brand", "agency"] as const satisfies readonly BusinessProfile[];

/** Slug em português usado em ?perfil= e em /comecar/<slug>. */
export const PROFILE_SLUG: Record<SignupProfile, string> = { hero: "heroi", brand: "marca", agency: "agencia", consumer: "app" };

/** ?perfil=heroi|marca|agencia|app (aceita também o nome interno). Desconhecido = nulo (mostra os cartões). */
export function parseSignupProfile(value: unknown): SignupProfile | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  for (const p of SIGNUP_PROFILES) if (v === PROFILE_SLUG[p] || v === p) return p;
  return null;
}

export function isBusinessProfile(value: unknown): value is BusinessProfile {
  return typeof value === "string" && (BUSINESS_PROFILES as readonly string[]).includes(value);
}

/** Portal de cada perfil depois do passo a passo. */
export const PROFILE_HOME: Record<BusinessProfile, string> = { hero: "/heroi", brand: "/marca", agency: "/agencia" };

/** Passo a passo (a escolha fica guardada no banco; voltar aqui retoma). */
export const PROFILE_ONBOARDING_PATH = "/primeiro-acesso";

/** Página autenticada que começa o passo a passo (Configurações › "Quero ser…", Google e "Já tenho conta"). */
export function startPathFor(profile: BusinessProfile): string {
  return `/comecar/${PROFILE_SLUG[profile]}`;
}

/** Entrada com o perfil escolhido: /login?perfil=… (mantém o destino pedido, se houver). */
export function loginPathFor(profile: SignupProfile, next?: string | null, email?: string | null): string {
  const params = new URLSearchParams({ perfil: PROFILE_SLUG[profile] });
  if (next) params.set("next", next);
  if (email) params.set("email", email);
  return `/login?${params.toString()}`;
}

/** Para onde vai quem acabou de criar a conta: consumidor segue o destino; os demais vão ao passo a passo. */
export function destinationAfterSignup(profile: SignupProfile, next: string): string {
  return profile === "consumer" ? next : PROFILE_ONBOARDING_PATH;
}

/** Cartões que aparecem: no app das lojas os portais de marca e agência não existem (só web). */
export function profilesForSurface(native: boolean): SignupProfile[] {
  return native ? SIGNUP_PROFILES.filter((p) => p !== "brand" && p !== "agency") : [...SIGNUP_PROFILES];
}

/** "Quero ser Herói/Marca/Agência" (Configurações): só os perfis que a pessoa ainda não tem. */
export function becomeOptions(roles: readonly string[], native = false): BusinessProfile[] {
  const has: Record<BusinessProfile, boolean> = { hero: roles.includes("creator"), brand: roles.includes("brand"), agency: roles.includes("agency") };
  return BUSINESS_PROFILES.filter((p) => !has[p] && !(native && p !== "hero"));
}

const passwordSchema = z.string({ error: "required" }).min(8, { error: "passwordTooShort" }).max(72, { error: "passwordTooLong" });

/** Cadastro com perfil: os campos do cadastro rápido (nome completo, e-mail, celular) + a senha escolhida. */
export const profileSignupSchema = quickSignupSchema.extend({ password: passwordSchema });
export type ProfileSignupInput = z.infer<typeof profileSignupSchema>;

/** Erros das RPCs do self-service que a tela traduz (invites.selfSignup.errors.*). Outros = unknown. */
export const SELF_ONBOARDING_ERRORS = [
  "agency_member_elsewhere",
  "brand_already_owned",
  "has_hero",
  "rate_limited",
  "experiment_closed",
  "demo_account_forbidden",
] as const;
export type SelfOnboardingError = (typeof SELF_ONBOARDING_ERRORS)[number] | "unknown";

export function selfOnboardingError(message: string | null | undefined): SelfOnboardingError {
  const m = message ?? "";
  return SELF_ONBOARDING_ERRORS.find((code) => m.includes(code)) ?? "unknown";
}
