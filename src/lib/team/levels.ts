// Níveis de senioridade (reunião Groscove, 06/11/2026): Júnior < Pleno < Sênior. Autodeclarados — como a pessoa se
// sente na função, não os números de seguidores. Valem para colaboradores de agência e de marca e para o Hero.
// O banco confere os mesmos valores (public.member_level_valid, 0125). Módulo puro (testável).
import { PARTNER_TERMS_VERSION } from "@/lib/partner-terms/version";
import { isValidCnpj } from "@/lib/invitations/rules";

export const MEMBER_LEVELS = ["junior", "pleno", "senior"] as const;
export type MemberLevel = (typeof MEMBER_LEVELS)[number];

export function isMemberLevel(value: unknown): value is MemberLevel {
  return typeof value === "string" && (MEMBER_LEVELS as readonly string[]).includes(value);
}

/** Ordem para listas (Sênior primeiro). */
export function levelRank(level: string | null | undefined): number {
  return level === "senior" ? 3 : level === "pleno" ? 2 : level === "junior" ? 1 : 0;
}

export type MemberProfile = { cnpj: string | null; level: string | null; termsVersion: string | null };

/** Cadastro PJ completo: CNPJ válido, nível escolhido e o Termo do Parceiro vigente aceito. */
export function memberProfileComplete(p: MemberProfile | null | undefined): boolean {
  if (!p) return true; // admin da plataforma sem vínculo: nada a completar
  return Boolean(p.cnpj && isValidCnpj(p.cnpj)) && isMemberLevel(p.level) && p.termsVersion === PARTNER_TERMS_VERSION;
}
