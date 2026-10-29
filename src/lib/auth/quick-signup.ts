import { z } from "zod";
import { normalizeBrMobile } from "./phone";

// Cadastro rápido (nome completo, e-mail, celular). Módulo puro: validação e regras de limite,
// usados pela server action e pelos testes. Mensagens = CHAVES de auth.errors.*.

/** Campo-isca: invisível para pessoas; robôs que preenchem tudo caem aqui. */
export const HONEYPOT_FIELD = "website";

/** Cookie (sem dado pessoal) que segura a tela "Sua senha" depois que a sessão já existe. */
export const QUICK_SIGNUP_PENDING_COOKIE = "uh-qs-pending";

/** Limites por janela de 1 hora (contam tentativas válidas, com ou sem sucesso). */
export const QUICK_SIGNUP_LIMITS = { windowMinutes: 60, perIp: 10, perEmail: 3 } as const;

export function quickSignupRateLimited(counts: { ip: number; email: number }): boolean {
  return counts.ip >= QUICK_SIGNUP_LIMITS.perIp || counts.email >= QUICK_SIGNUP_LIMITS.perEmail;
}

/** Nome e sobrenome: 2+ partes com letra, 3 a 120 caracteres, espaços normalizados. */
export function normalizeFullName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function isFullName(v: string): boolean {
  if (v.length < 3 || v.length > 120) return false;
  if (v.split(" ").filter((part) => /\p{L}/u.test(part)).length < 2) return false;
  // sem dígitos, marcação ou links
  return !/[<>{}\\/@]|https?:/i.test(v) && !/\d/.test(v);
}

const fullNameSchema = z
  .string({ error: "required" })
  .transform(normalizeFullName)
  .superRefine((v, ctx) => {
    if (!v) ctx.addIssue({ code: "custom", message: "required" });
    else if (!isFullName(v)) ctx.addIssue({ code: "custom", message: "fullNameInvalid" });
  });

const emailSchema = z
  .string({ error: "required" })
  .trim()
  .toLowerCase()
  .min(1, { error: "required" })
  .max(254, { error: "invalidEmail" })
  .pipe(z.email({ error: "invalidEmail" }));

const phoneSchema = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .transform((v, ctx) => {
    const e164 = normalizeBrMobile(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }
    return e164;
  });

export const quickSignupSchema = z.object({ fullName: fullNameSchema, email: emailSchema, phone: phoneSchema });
export type QuickSignupInput = z.infer<typeof quickSignupSchema>;

/** Só o celular (Perfil › Conta). */
export const phoneOnlySchema = z.object({ phone: phoneSchema });
