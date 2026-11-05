import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { HERO_PORTAL_HOME, HERO_TEAM_HOME, ONBOARDING_HOME, portalHomeForAccepted } from "@/lib/auth/invite-home";
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
// depois do aceite e equipe do Hero. As regras do banco (quem convida quem) são testadas no S98.

const HERO = "11111111-1111-4111-8111-111111111111";
const base: AdminInviteForm = { email: "pessoa@exemplo.com", role: "consumer", days: 7 };

describe("validade do convite", () => {
  it("padrão 7 dias; Admin 48h (2 dias) no máximo", () => {
    expect(defaultDaysFor("brand")).toBe(7);
    expect(defaultDaysFor("admin")).toBe(2);
    expect(maxDaysFor("admin")).toBe(2);
    expect(maxDaysFor("hero")).toBe(30);
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
  it("sete papéis: o Creator é o próprio Hero (0097)", () => {
    expect(ADMIN_INVITE_ROLES).toEqual(["consumer", "admin", "agency", "brand", "hero", "seller", "professional"]);
    expect(ADMIN_INVITE_ROLES).not.toContain("creator");
  });
  it("campos condicionais por papel", () => {
    expect(adminInviteFields("hero")).toMatchObject({ heroMode: true, heroLink: false, heroTalent: false, heroTeam: true, heroName: true });
    expect(adminInviteFields("hero", "team")).toMatchObject({ heroMode: true, heroLink: true, heroTalent: false, heroTeam: false, heroName: false });
    expect(adminInviteFields("hero", "casting")).toMatchObject({ heroMode: true, heroLink: false, heroTalent: true, heroTeam: false });
    expect(adminInviteFields("admin").adminConfirm).toBe(true);
    expect(adminInviteFields("brand").onboardingNote).toBe(true);
    expect(adminInviteFields("consumer")).toMatchObject({ heroLink: false, heroTeam: false, adminConfirm: false, onboardingNote: false });
  });
  it("Hero → equipe exige o Hero; Hero → casting exige a ficha", () => {
    expect(validateAdminInvite({ ...base, role: "hero", heroMode: "team" })).toEqual(["hero_id"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroMode: "team", heroId: HERO })).toEqual([]);
    expect(validateAdminInvite({ ...base, role: "hero", heroMode: "casting" })).toEqual(["talent_id"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroMode: "casting", talentId: HERO })).toEqual([]);
    expect(validateAdminInvite({ ...base, role: "hero", heroMode: "new", heroName: "A" })).toEqual(["hero_name"]);
  });
  it("Hero: nome obrigatório; creator novo com e-mail diferente do titular", () => {
    expect(validateAdminInvite({ ...base, role: "hero" })).toEqual(["hero_name"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroName: "Hero X", teamMode: "new", teamEmail: "PESSOA@exemplo.com" })).toEqual(["team_email"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroName: "Hero X", teamMode: "existing" })).toEqual(["team_user"]);
    expect(validateAdminInvite({ ...base, role: "hero", heroName: "Hero X", teamMode: "new", teamEmail: "social@exemplo.com" })).toEqual([]);
  });
  it("e-mail inválido e validade fora do intervalo", () => {
    expect(validateAdminInvite({ ...base, email: "x" })).toEqual(["email"]);
    expect(validateAdminInvite({ ...base, days: 31 })).toEqual(["days"]);
  });
  it("opções enviadas à RPC: só as do papel", () => {
    expect(adminInviteOptions({ ...base, role: "admin", confirmAdmin: true })).toEqual({ confirm_admin: true });
    expect(adminInviteOptions({ ...base, role: "hero", heroMode: "team", heroId: HERO, heroName: "ignorado" })).toEqual({ hero_mode: "team", hero_id: HERO });
    expect(adminInviteOptions({ ...base, role: "hero", heroMode: "casting", talentId: HERO, heroName: "ignorado" })).toEqual({ hero_mode: "casting", talent_id: HERO });
    expect(adminInviteOptions({ ...base, role: "hero", heroName: "  Novo  " })).toEqual({ hero_mode: "new", hero_name: "Novo", team_mode: "later" });
    expect(adminInviteOptions({ ...base, role: "hero", heroName: "H", teamMode: "new", teamEmail: "A@B.com" })).toEqual({ hero_mode: "new", hero_name: "H", team_mode: "new", team_email: "a@b.com" });
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
  it("admin, creator sem Hero e consumidor", () => {
    expect(portalHomeForAccepted([{ role: "admin", scope_type: "global" }])).toBe("/admin");
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "global" }])).toBe(HERO_TEAM_HOME);
    expect(HERO_TEAM_HOME).toBe("/heroi");
    expect(portalHomeForAccepted([{ role: "consumer", scope_type: "consumer" }])).toBe("/");
  });
  it("todo convite de Hero (titular, membro da equipe, ficha do casting) leva ao Portal do Hero", () => {
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", team_role: "member" } as never])).toBe(HERO_PORTAL_HOME);
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", talent_id: "t" }])).toBe(HERO_PORTAL_HOME);
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "talent", talent_id: "t" }])).toBe(HERO_PORTAL_HOME);
    expect(HERO_PORTAL_HOME).toBe("/heroi");
  });
});

describe("equipe do Hero", () => {
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
