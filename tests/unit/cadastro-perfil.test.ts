import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import {
  destinationAfterSignup,
  isBusinessProfile,
  loginPathFor,
  parseSignupProfile,
  PROFILE_HOME,
  profilesForSurface,
  profileSignupSchema,
  selfOnboardingError,
  startPathFor,
} from "@/lib/auth/profile-signup";
import { adminHrefFor, parseSelfSignups, selfSignupState } from "@/lib/auth/self-signups";
import { invitesEnabledFrom, isInvitesDisabledError } from "@/lib/invitations/flag-rules";
import { isOnboardingKind, isWizardKind } from "@/lib/invitations/rules";

// 0103: cadastro por perfil (Hero, Marca, Agência ou só o app) e convites pausados.

describe("perfis da tela de entrada", () => {
  it("quatro cartões na ordem; no app das lojas só Hero e app (marca e agência são só web)", () => {
    expect(profilesForSurface(false)).toEqual(["hero", "brand", "agency", "consumer"]);
    expect(profilesForSurface(true)).toEqual(["hero", "consumer"]);
  });

  it("?perfil= aceita o slug em português e o nome interno; o resto mostra os cartões", () => {
    expect(parseSignupProfile("heroi")).toBe("hero");
    expect(parseSignupProfile("Marca")).toBe("brand");
    expect(parseSignupProfile("agencia")).toBe("agency");
    expect(parseSignupProfile("app")).toBe("consumer");
    expect(parseSignupProfile("agency")).toBe("agency");
    expect(parseSignupProfile("creator")).toBeNull();
    expect(parseSignupProfile(undefined)).toBeNull();
    expect(isBusinessProfile("consumer")).toBe(false);
    expect(isBusinessProfile("hero")).toBe(true);
  });

  it("destino por perfil: consumidor segue o destino; Hero, Marca e Agência vão ao passo a passo e depois ao portal", () => {
    expect(destinationAfterSignup("consumer", "/personalities")).toBe("/personalities");
    for (const p of ["hero", "brand", "agency"] as const) expect(destinationAfterSignup(p, "/personalities")).toBe("/primeiro-acesso");
    expect(PROFILE_HOME).toEqual({ hero: "/heroi", brand: "/marca", agency: "/agencia" });
    expect(startPathFor("brand")).toBe("/comecar/marca");
    expect(loginPathFor("hero")).toBe("/login?perfil=heroi");
    expect(loginPathFor("consumer", "/profile")).toBe("/login?perfil=app&next=%2Fprofile");
  });

});

describe("formulário do cadastro por perfil", () => {
  const ok = { fullName: "Maria  Souza", email: " Maria@Exemplo.com ", password: "senha-forte" };

  it("aceita e normaliza (nome, e-mail minúsculo)", () => {
    const r = profileSignupSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ fullName: "Maria Souza", email: "maria@exemplo.com", password: "senha-forte" });
  });

  it("recusa senha curta/longa, nome sem sobrenome, e-mail inválido (chaves de auth.errors)", () => {
    const issues = (input: object) => {
      const r = profileSignupSchema.safeParse({ ...ok, ...input });
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(issues({ password: "1234567" })).toEqual(["passwordTooShort"]);
    expect(issues({ password: "x".repeat(73) })).toEqual(["passwordTooLong"]);
    expect(issues({ fullName: "Maria" })).toEqual(["fullNameInvalid"]);
    expect(issues({ email: "maria@" })).toEqual(["invalidEmail"]);
    expect(issues({ password: undefined })).toEqual(["required"]);
  });

  it("erros do self-service viram chaves conhecidas", () => {
    expect(selfOnboardingError("brand_already_owned")).toBe("brand_already_owned");
    expect(selfOnboardingError("ERROR: rate_limited")).toBe("rate_limited");
    expect(selfOnboardingError("profile_conflict:agency")).toBe("profile_conflict");
    expect(selfOnboardingError("boom")).toBe("unknown");
    expect(selfOnboardingError(null)).toBe("unknown");
  });
});

describe("interruptor Convites ativos", () => {
  it("só false explícito desliga; erro ou RPC ausente = ligado (o banco segue barrando)", () => {
    expect(invitesEnabledFrom({ data: false, error: null })).toBe(false);
    expect(invitesEnabledFrom({ data: true, error: null })).toBe(true);
    expect(invitesEnabledFrom({ data: null, error: { code: "PGRST202" } })).toBe(true);
    expect(invitesEnabledFrom({ data: false, error: { code: "42883" } })).toBe(true);
  });

  it("o código do banco é reconhecido e traduzido como erro de agência", () => {
    expect(isInvitesDisabledError({ message: "invites_disabled" })).toBe(true);
    expect(isInvitesDisabledError(new Error("forbidden"))).toBe(false);
    expect(agencyErrorCode({ message: "invites_disabled" })).toBe("invites_disabled");
    expect(agencyErrorCode({ message: "brand_already_owned" })).toBe("brand_already_owned");
  });
});

describe("passo a passo e novos cadastros", () => {
  it("o passo a passo aceita Hero; o convite do admin continua só com os 4 papéis de empresa", () => {
    expect(isWizardKind("hero")).toBe(true);
    expect(isWizardKind("agency")).toBe(true);
    expect(isOnboardingKind("hero")).toBe(false);
  });

  it("lista do admin: lê o retorno, estado e atalho para ver/suspender/aprovar", () => {
    const rows = parseSelfSignups([
      { id: "1", kind: "hero", created_at: "2026-11-04T10:00:00Z", completed_at: "2026-11-04T10:01:00Z", cancelled: false, email: "a@x.com", result_id: "h1", name: "Hero", status: "pending" },
      { id: "2", kind: "brand", created_at: "2026-11-04T10:00:00Z", completed_at: null, cancelled: false, email: "b@x.com", result_id: null, name: null, status: null },
      { id: "3", kind: "agency", created_at: "2026-11-04T10:00:00Z", completed_at: "2026-11-04T10:00:00Z", cancelled: true, email: "c@x.com", result_id: null },
      { id: "4", kind: "seller" },
      null,
    ]);
    expect(rows.map((r) => [r.id, selfSignupState(r), adminHrefFor(r)])).toEqual([
      ["1", "pending", "/admin/herois/h1"],
      ["2", "inProgress", null],
      ["3", "cancelled", null],
    ]);
    expect(adminHrefFor({ kind: "brand", resultId: "b1" })).toBe("/admin/marcas/b1");
    expect(adminHrefFor({ kind: "agency", resultId: "a1" })).toBe("/admin/agencia");
    expect(parseSelfSignups("x")).toEqual([]);
  });
});
