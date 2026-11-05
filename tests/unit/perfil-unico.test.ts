import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { businessKindOfRoles, profileConflictKind, profileConflictParams } from "@/lib/auth/profile-conflict";
import * as signup from "@/lib/auth/profile-signup";

// 0116: um e-mail, um perfil de negócio (Hero OU Marca OU Agência).
describe("conflito de perfil", () => {
  it("reconhece o tipo que a conta já tem na mensagem do banco", () => {
    expect(profileConflictKind("profile_conflict:agency")).toBe("agency");
    expect(profileConflictKind({ message: "profile_conflict:hero" })).toBe("hero");
    expect(profileConflictKind(new Error("profile_conflict:brand"))).toBe("brand");
    expect(profileConflictKind("profile_conflict:admin")).toBeNull();
    expect(profileConflictKind("forbidden")).toBeNull();
    expect(profileConflictKind(null)).toBeNull();
    expect(profileConflictParams("profile_conflict")).toEqual({ kind: "other" });
    expect(profileConflictParams("profile_conflict:brand")).toEqual({ kind: "brand" });
  });

  it("vira o código traduzido das telas da agência, da marca e do Hero", () => {
    expect(agencyErrorCode({ message: "profile_conflict:hero" })).toBe("profile_conflict");
  });

  it("tipo pelos papéis: consumidor e admin não contam", () => {
    expect(businessKindOfRoles(["consumer"])).toBeNull();
    expect(businessKindOfRoles(["consumer", "admin"])).toBeNull();
    expect(businessKindOfRoles(["consumer", "creator"])).toBe("hero");
    expect(businessKindOfRoles(["brand"])).toBe("brand");
    expect(businessKindOfRoles(["agency", "consumer"])).toBe("agency");
  });

  it("sem atalho 'Quero ser…' (Novo perfil) nas Configurações", () => {
    expect("becomeOptions" in signup).toBe(false);
  });
});
