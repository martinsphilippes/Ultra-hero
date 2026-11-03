import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { HERO_TEAM_HOME, ONBOARDING_HOME, OFFICE_HOME, portalHomeForAccepted } from "@/lib/auth/invite-home";
import { canManageTeam, memberActions, parseHeroTeam, parseMyHero } from "@/lib/invitations/hero-team";
import {
  ADMIN_INVITE_ROLES,
  adminInviteFields,
  adminInviteOptions,
  clampDays,
  defaultDaysFor,
  formatCnpj,
  isValidCnpj,
  maxDaysFor,
  validateAdminInvite,
  type AdminInviteForm,
} from "@/lib/invitations/rules";

// Bloco Convites (0091): validade, campos condicionais do formulário do admin, opções da RPC, CNPJ, destino
// depois do aceite e equipe do herói. As regras do banco (quem convida quem) são testadas no S98.

const HERO = "11111111-1111-4111-8111-111111111111";
const base: AdminInviteForm = { email: "pessoa@exemplo.com", role: "consumer", days: 7 };

describe("validade do convite", () => {
  it("padrão 7 dias; Admin 48h (2 dias) no máximo", () => {
    expect(defaultDaysFor("brand")).toBe(7);
    expect(defaultDaysFor("admin")).toBe(2);
    expect(maxDaysFor("admin")).toBe(2);
    expect(maxDaysFor("creator")).toBe(30);
  });
  it("trocar de papel mantém a validade dentro do limite", () => {
    expect(clampDays("admin", 7)).toBe(2);
    expect(clampDays("agency", 45)).toBe(30);
    expect(clampDays("agency", 0)).toBe(7);
    expect(clampDays("hero", 14)).toBe(14);
  });
  it("Admin acima de 48h é recusado e pede a confirmação extra", () => {
    expect(validateAdminInvite({ ...base, role: "admin", days: 3, confirmAdmin: true })).toEqual(["admin_max_48h"]);
    expect(validateAdminInvite({ ...base, role: "admin", days: 2 })).toEqual(["admin_confirm"]);
    expect(validateAdminInvite({ ...base, role: "admin", days: 2, confirmAdmin: true })).toEqual([]);
  });
});

describe("formulário do admin", () => {
  it("oito papéis, com Herói e Creator separados", () => {
    expect(ADMIN_INVITE_ROLES).toEqual(["consumer", "admin", "agency", "brand", "creator", "hero", "seller", "professional"]);
  });
  it("campos condicionais por papel", () => {
    expect(adminInviteFields("creator")).toMatchObject({ heroLink: true, heroTeam: false, adminConfirm: false });
    expect(adminInviteFields("hero")).toMatchObject({ heroLink: false, heroTeam: true, heroName: true });
    expect(adminInviteFields("admin").adminConfirm).toBe(true);
    expect(adminInviteFields("brand").onboardingNote).toBe(true);
    expect(adminInviteFields("consumer")).toMatchObject({ heroLink: false, heroTeam: false, adminConfirm: false, onboardingNote: false });
  });
  it("Creator: herói existente exige a escolha; herói novo exige o nome", () => {
    expect(validateAdminInvite({ ...base, role: "creator", heroMode: "existing" })).toEqual(["hero_id"]);
    expect(validateAdminInvite({ ...base, role: "creator", heroMode: "existing", heroId: HERO })).toEqual([]);
    expect(validateAdminInvite({ ...base, role: "creator", heroMode: "new", heroName: "A" })).toEqual(["hero_name"]);
    expect(validateAdminInvite({ ...base, role: "creator" })).toEqual([]);
  });
  it("Herói: nome obrigatório; creator novo com e-mail diferente do titular", () => {
    expect(validateAdminInvite({ ...base, role: "hero" })).toEqual(["hero_name"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroName: "Herói X", teamMode: "new", teamEmail: "PESSOA@exemplo.com" })).toEqual(["team_email"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroName: "Herói X", teamMode: "existing" })).toEqual(["team_user"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroName: "Herói X", teamMode: "new", teamEmail: "social@exemplo.com" })).toEqual([]);
  });
  it("e-mail inválido e validade fora do intervalo", () => {
    expect(validateAdminInvite({ ...base, email: "x" })).toEqual(["email"]);
    expect(validateAdminInvite({ ...base, days: 31 })).toEqual(["days"]);
  });
  it("opções enviadas à RPC: só as do papel", () => {
    expect(adminInviteOptions({ ...base, role: "admin", confirmAdmin: true })).toEqual({ confirm_admin: true });
    expect(adminInviteOptions({ ...base, role: "creator", heroMode: "existing", heroId: HERO, heroName: "ignorado" })).toEqual({ hero_mode: "existing", hero_id: HERO });
    expect(adminInviteOptions({ ...base, role: "creator", heroMode: "new", heroName: "  Novo  " })).toEqual({ hero_mode: "new", hero_name: "Novo" });
    expect(adminInviteOptions({ ...base, role: "hero", heroName: "H", teamMode: "new", teamEmail: "A@B.com" })).toEqual({ hero_name: "H", team_mode: "new", team_email: "a@b.com" });
    expect(adminInviteOptions({ ...base, role: "brand", heroName: "x" })).toEqual({});
  });
});

describe("CNPJ", () => {
  it("dígitos verificadores", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });
  it("máscara enquanto digita", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("11222")).toBe("11.222");
  });
});

describe("destino depois do aceite", () => {
  it("onboarding vem antes de tudo", () => {
    expect(portalHomeForAccepted([{ scope_type: "agency" }, { role: "brand", scope_type: "onboarding", onboarding: "brand" }])).toBe(ONBOARDING_HOME);
    expect(portalHomeForAccepted([{ scope_type: "onboarding", error: "x" }, { scope_type: "brand" }])).toBe("/marca");
  });
  it("admin, creator sem herói e consumidor", () => {
    expect(portalHomeForAccepted([{ role: "admin", scope_type: "global" }])).toBe("/admin");
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "global" }])).toBe(HERO_TEAM_HOME);
    expect(portalHomeForAccepted([{ role: "consumer", scope_type: "consumer" }])).toBe("/");
  });
  it("membro da equipe do herói vai ao Perfil; convite do escritório segue no escritório", () => {
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", team_role: "member" } as never])).toBe("/profile");
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", talent_id: "t" }])).toBe(OFFICE_HOME);
  });
});

describe("equipe do herói", () => {
  const team = parseHeroTeam({
    my_role: "owner",
    members: [
      { user_id: "u1", role: "owner", name: "Ana", email: "a•••@x.com", since: "2026-11-01", me: true },
      { user_id: "u2", role: "member", name: "Bia", email: null, since: "2026-11-02", me: false },
      { role: "member" },
    ],
    invites: [{ id: "i1", email: "c@x.com", expires_at: "2026-11-10" }],
  });
  it("lê o JSON do banco (ignora linha sem pessoa)", () => {
    expect(team.members.map((m) => m.userId)).toEqual(["u1", "u2"]);
    expect(team.invites).toEqual([{ id: "i1", email: "c@x.com", expiresAt: "2026-11-10" }]);
    expect(parseHeroTeam(null)).toEqual({ myRole: null, members: [], invites: [] });
    expect(parseMyHero({ creator_id: "c", role: "member", status: "pending", name: "H", slug: "h" })).toMatchObject({ creatorId: "c", role: "member", status: "pending" });
    expect(parseMyHero(null)).toBeNull();
  });
  it("titular e admin gerem; membro não; o titular não é removido (transfere antes)", () => {
    expect(canManageTeam(team)).toBe(true);
    expect(canManageTeam({ myRole: "member" })).toBe(false);
    expect(canManageTeam({ myRole: "admin" })).toBe(true);
    expect(memberActions(team, team.members[0])).toEqual({ remove: false, transfer: false });
    expect(memberActions(team, team.members[1])).toEqual({ remove: true, transfer: true });
    expect(memberActions({ myRole: "member" }, team.members[1])).toEqual({ remove: false, transfer: false });
  });
});

describe("erros novos traduzidos", () => {
  it("códigos do banco viram chaves de agency.errors", () => {
    for (const code of ["admin_invite_max_48h", "admin_confirm_required", "owner_must_transfer", "onboarding_not_found", "invalid_cnpj", "has_hero", "creator_role_required"]) {
      expect(AGENCY_ERROR_CODES).toContain(code);
      expect(agencyErrorCode({ message: code })).toBe(code);
    }
    expect(agencyErrorCode({ message: "invitation_email_mismatch" })).toBe("invitation_email_mismatch");
  });
});
