import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GENERATED_PASSWORD_PATTERN,
  PASSWORD_ALPHABET,
  PASSWORD_DIGITS,
  generatePassword,
  generatedPasswordEntropyBits,
} from "@/lib/auth/generated-password";
import { currentPasswordKeyVersion, isPasswordVaultConfigured, openPassword, passwordKey, sealPassword } from "@/lib/auth/password-crypto";
import { formatBrPhoneInput, formatE164ForDisplay, normalizeBrMobile } from "@/lib/auth/phone";
import { QUICK_SIGNUP_LIMITS, normalizeFullName, phoneOnlySchema, quickSignupRateLimited, quickSignupSchema } from "@/lib/auth/quick-signup";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const k = () => randomBytes(32).toString("base64");

describe("senha gerada", () => {
  it("formato Xxxx-xxxx-xxxx, só caracteres sem ambiguidade", () => {
    for (let i = 0; i < 2000; i++) {
      const p = generatePassword();
      expect(p).toMatch(GENERATED_PASSWORD_PATTERN);
      expect(p).toHaveLength(14);
      expect(p).not.toMatch(/[0O1lIio]/);
      // maiúscula, minúscula, dígito e símbolo: passa em qualquer regra de complexidade do Auth
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p.replace(/-/g, "").split("").filter((c) => PASSWORD_DIGITS.includes(c)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("entropia de pelo menos 58 bits e sem repetição em 5.000 sorteios", () => {
    expect(PASSWORD_ALPHABET).toHaveLength(31);
    expect(generatedPasswordEntropyBits()).toBeGreaterThanOrEqual(58);
    const seen = new Set(Array.from({ length: 5000 }, () => generatePassword()));
    expect(seen.size).toBe(5000);
  });

  it("usa todo o alfabeto (distribuição sem buracos)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      for (const c of generatePassword().slice(1).replace(/-/g, "")) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const c of PASSWORD_ALPHABET) expect(counts.get(c) ?? 0).toBeGreaterThan(0);
  });

  it("rejeita sorteio com menos de 2 dígitos e tenta de novo", () => {
    // 1ª tentativa: só letras; 2ª: com dígitos (índices ≥ 23 são dígitos)
    const seq = [0, ...Array(11).fill(0), 0, ...Array(9).fill(0), 23, 24];
    let i = 0;
    const p = generatePassword(() => seq[i++] ?? 0);
    expect(p).toBe("Aaaa-aaaa-aa23");
  });
});

describe("celular brasileiro", () => {
  it.each([
    ["(11) 91234-5678", "+5511912345678"],
    ["11912345678", "+5511912345678"],
    ["+55 11 91234-5678", "+5511912345678"],
    ["55 (21) 99876-5432", "+5521998765432"],
    ["011 91234-5678", "+5511912345678"],
    [" 85 9 8888 7777 ", "+5585988887777"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeBrMobile(input)).toBe(expected);
  });

  it.each([
    ["", "vazio"],
    ["1191234567", "10 dígitos (fixo antigo)"],
    ["(11) 3123-4567", "fixo"],
    ["(11) 81234-5678", "não começa com 9"],
    ["(20) 91234-5678", "DDD inexistente"],
    ["(10) 91234-5678", "DDD inexistente"],
    ["+1 415 555 0100", "outro país"],
    ["119123456789", "dígito a mais"],
  ])("recusa %s (%s)", (input) => {
    expect(normalizeBrMobile(input)).toBeNull();
  });

  it("máscara enquanto digita", () => {
    expect(formatBrPhoneInput("1")).toBe("(1");
    expect(formatBrPhoneInput("11")).toBe("(11");
    expect(formatBrPhoneInput("119")).toBe("(11) 9");
    expect(formatBrPhoneInput("1191234")).toBe("(11) 91234");
    expect(formatBrPhoneInput("11912345678")).toBe("(11) 91234-5678");
    expect(formatBrPhoneInput("119123456789999")).toBe("(11) 91234-5678");
    expect(formatBrPhoneInput("+5511912345678")).toBe("+55 (11) 91234-5678");
    expect(normalizeBrMobile(formatBrPhoneInput("+5511912345678"))).toBe("+5511912345678");
  });

  it("exibe E.164 no formato nacional", () => {
    expect(formatE164ForDisplay("+5511912345678")).toBe("(11) 91234-5678");
    expect(formatE164ForDisplay(null)).toBe("");
    expect(formatE164ForDisplay("+14155550100")).toBe("+14155550100");
  });
});

describe("cofre da senha (AES-256-GCM com versão de chave)", () => {
  it("cifra e decifra; cada cifragem é diferente; texto puro não aparece", () => {
    const env = { ACCOUNT_PASSWORD_KEY_V1: k() };
    const a = sealPassword("Abcd-efgh-2345", USER, env);
    const b = sealPassword("Abcd-efgh-2345", USER, env);
    expect(a.keyVersion).toBe(1);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(Buffer.from(a.ciphertext, "base64").toString("utf8")).not.toContain("Abcd");
    expect(a.ciphertext.length).toBeGreaterThanOrEqual(40);
    expect(a.ciphertext.length).toBeLessThanOrEqual(400);
    expect(openPassword(a.ciphertext, USER, a.keyVersion, env)).toBe("Abcd-efgh-2345");
  });

  it("não abre para outra pessoa (AAD), com outra versão ou com texto alterado", () => {
    const env = { ACCOUNT_PASSWORD_KEY_V1: k(), ACCOUNT_PASSWORD_KEY_V2: k() };
    const sealed = sealPassword("Abcd-efgh-2345", USER, env);
    expect(() => openPassword(sealed.ciphertext, OTHER, 1, env)).toThrow();
    expect(() => openPassword(sealed.ciphertext, USER, 2, env)).toThrow();
    const raw = Buffer.from(sealed.ciphertext, "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => openPassword(raw.toString("base64"), USER, 1, env)).toThrow();
    expect(() => openPassword("abc", USER, 1, env)).toThrow();
  });

  it("rotação: grava com a versão atual e ainda lê a antiga", () => {
    const v1 = k();
    const old = sealPassword("Old1-pass-2345", USER, { ACCOUNT_PASSWORD_KEY_V1: v1 });
    const env = { ACCOUNT_PASSWORD_KEY_V1: v1, ACCOUNT_PASSWORD_KEY_V2: k(), ACCOUNT_PASSWORD_KEY_VERSION: "2" };
    expect(currentPasswordKeyVersion(env)).toBe(2);
    const fresh = sealPassword("New2-pass-6789", USER, env);
    expect(fresh.keyVersion).toBe(2);
    expect(openPassword(old.ciphertext, USER, 1, env)).toBe("Old1-pass-2345");
    expect(openPassword(fresh.ciphertext, USER, 2, env)).toBe("New2-pass-6789");
    // chave antiga removida: a senha antiga não abre mais
    expect(() => openPassword(old.ciphertext, USER, 1, { ACCOUNT_PASSWORD_KEY_V2: env.ACCOUNT_PASSWORD_KEY_V2, ACCOUNT_PASSWORD_KEY_VERSION: "2" })).toThrow();
  });

  it("sem chave (ou chave inválida) o cofre fica desligado e não cifra", () => {
    expect(isPasswordVaultConfigured({})).toBe(false);
    expect(isPasswordVaultConfigured({ ACCOUNT_PASSWORD_KEY_V1: Buffer.alloc(16).toString("base64") })).toBe(false);
    expect(isPasswordVaultConfigured({ ACCOUNT_PASSWORD_KEY_V1: k(), ACCOUNT_PASSWORD_KEY_VERSION: "2" })).toBe(false);
    expect(() => sealPassword("x", USER, {})).toThrow("account_password_key_missing");
    // ACCOUNT_PASSWORD_KEY sem versão vale como V1
    const env = { ACCOUNT_PASSWORD_KEY: k() };
    expect(isPasswordVaultConfigured(env)).toBe(true);
    expect(passwordKey(1, env)).not.toBeNull();
    expect(passwordKey(2, env)).toBeNull();
    expect(currentPasswordKeyVersion({ ACCOUNT_PASSWORD_KEY_VERSION: "abc" })).toBe(1);
  });
});

describe("validação do cadastro rápido", () => {
  const ok = { fullName: "  Maria   da Silva ", email: " Maria@Exemplo.COM ", phone: "(11) 91234-5678" };

  it("normaliza nome, e-mail e celular", () => {
    const r = quickSignupSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ fullName: "Maria da Silva", email: "maria@exemplo.com", phone: "+5511912345678" });
    expect(normalizeFullName("  Jose" + "\u0301" + "  Ávila ")).toBe("José Ávila");
  });

  const errorsOf = (input: Record<string, unknown>) => {
    const r = quickSignupSchema.safeParse(input);
    if (r.success) return {};
    return Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("campos vazios: required", () => {
    expect(errorsOf({ fullName: "", email: "", phone: "" })).toEqual({ fullName: "required", email: "required", phone: "required" });
    expect(errorsOf({})).toEqual({ fullName: "required", email: "required", phone: "required" });
  });

  it.each(["Maria", "M", "Maria 123", "<b>Maria</b> Silva", "https://spam.example Silva", "x".repeat(121) + " Silva"])("nome inválido: %s", (fullName) => {
    expect(errorsOf({ ...ok, fullName }).fullName).toBe("fullNameInvalid");
  });

  it.each(["Ana Lu", "João D'Ávila", "Maria-Clara Souza", "Zé Ninguém"])("nome válido: %s", (fullName) => {
    expect(errorsOf({ ...ok, fullName }).fullName).toBeUndefined();
  });

  it("e-mail e celular inválidos", () => {
    expect(errorsOf({ ...ok, email: "maria@" }).email).toBe("invalidEmail");
    expect(errorsOf({ ...ok, phone: "(11) 3123-4567" }).phone).toBe("phoneInvalid");
    expect(phoneOnlySchema.safeParse({ phone: "+55 21 99876-5432" }).data?.phone).toBe("+5521998765432");
  });

  it("limite: 10 por IP e 3 por e-mail na janela de 1 hora", () => {
    expect(QUICK_SIGNUP_LIMITS.windowMinutes).toBe(60);
    expect(quickSignupRateLimited({ ip: 0, email: 0 })).toBe(false);
    expect(quickSignupRateLimited({ ip: 9, email: 2 })).toBe(false);
    expect(quickSignupRateLimited({ ip: 10, email: 0 })).toBe(true);
    expect(quickSignupRateLimited({ ip: 0, email: 3 })).toBe(true);
  });
});
