import { describe, expect, it } from "vitest";
import { PORTAL_LINKS, PORTAL_ROOT } from "@/components/layout/portal-nav";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { OFFICE_HOME, portalHomeForAccepted } from "@/lib/auth/invite-home";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import { buildPortalItems, OFFICE_PATH } from "@/lib/settings/sections";
import { canInviteCreator, resolveTalentAccess, talentAccessVariant, toTalentAccess } from "@/lib/talent/access";

// Bloco 10 (0087): login do creator com herói ligado e o escritório como portal. As regras do banco
// (quem convida, recusas, aceite ligando ao herói) são testadas no S94.

describe("aceite do convite do escritório", () => {
  it("convite de talento com herói (escopo creator + talent_id) abre o escritório, não o Perfil", () => {
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", scope_id: "c1", talent_id: "t1" }])).toBe(OFFICE_HOME);
    expect(OFFICE_HOME).toBe("/creator/escritorio");
  });
  it("convite de herói do admin (sem talento) segue para o Perfil; talento sem herói ao escritório", () => {
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", scope_id: "c1" }])).toBe("/profile");
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "talent", scope_id: "t1", talent_id: "t1" }])).toBe(OFFICE_HOME);
  });
  it("item com erro não manda; o primeiro aceito manda", () => {
    expect(portalHomeForAccepted([{ error: "user_has_talent", talent_id: "t1" }, { scope_type: "agency" }])).toBe("/agencia");
    expect(portalHomeForAccepted([{ scope_type: "brand" }, { scope_type: "creator", talent_id: "t1" }])).toBe("/marca");
  });
});

describe("selo do acesso no casting", () => {
  it("valores desconhecidos viram sem login", () => {
    expect(toTalentAccess("login")).toBe("login");
    expect(toTalentAccess("pending")).toBe("pending");
    expect(toTalentAccess("x")).toBe("none");
    expect(toTalentAccess(null)).toBe("none");
  });
  it("a leitura do banco manda; sem ela, só o login próprio conta (herói desconhecido não ganha selo)", () => {
    expect(resolveTalentAccess({ access: "pending", loginEmail: null, inviteExpiresAt: null }, { userId: null })).toBe("pending");
    expect(resolveTalentAccess({ access: "none", loginEmail: null, inviteExpiresAt: null }, { userId: "u" })).toBe("none");
    expect(resolveTalentAccess(undefined, { userId: "u" })).toBe("login");
    expect(resolveTalentAccess(undefined, { userId: null })).toBeNull();
  });
  it("cores do selo", () => {
    expect(talentAccessVariant("login")).toBe("success");
    expect(talentAccessVariant("pending")).toBe("warning");
    expect(talentAccessVariant("none")).toBe("neutral");
  });
  it("convidar: gestor+, agência real, sem login; herói ligado precisa estar no ar e com selo conhecido", () => {
    const base = { canEdit: true, locked: false, heroActive: true, hasHero: true };
    expect(canInviteCreator({ ...base, access: "none" })).toBe(true);
    expect(canInviteCreator({ ...base, access: "pending" })).toBe(true);
    expect(canInviteCreator({ ...base, access: "login" })).toBe(false);
    expect(canInviteCreator({ ...base, access: "none", canEdit: false })).toBe(false);
    expect(canInviteCreator({ ...base, access: "none", locked: true })).toBe(false);
    expect(canInviteCreator({ ...base, access: "none", heroActive: false })).toBe(false);
    expect(canInviteCreator({ ...base, access: null })).toBe(false);
    expect(canInviteCreator({ ...base, hasHero: false, heroActive: false, access: null })).toBe(true);
  });
  it("erros novos do convite são reconhecidos", () => {
    expect(agencyErrorCode({ message: "creator_has_login" })).toBe("creator_has_login");
    expect(agencyErrorCode({ message: "hero_invite_pending" })).toBe("hero_invite_pending");
    expect(agencyErrorCode({ message: "partner_suspended" })).toBe("partner_suspended");
    expect(agencyErrorCode({ message: "talent_has_login" })).toBe("talent_has_login");
  });
});

describe("portal do creator", () => {
  it("menu com as rotas do escritório, na ordem, raiz no Início", () => {
    expect(PORTAL_ROOT.office).toBe(OFFICE_PATH);
    expect(PORTAL_LINKS.office.map((l) => l.key)).toEqual([
      "dashboard",
      "opportunities",
      "tasks",
      "agenda",
      "earnings",
      "availability",
      "kit",
      "portfolio",
      "documents",
      "consent",
      "notifications",
    ]);
    expect(PORTAL_LINKS.office.every((l) => l.href === OFFICE_PATH || l.href.startsWith(`${OFFICE_PATH}/`))).toBe(true);
  });
  it("nada do portal é bloqueado no app das lojas", () => {
    for (const l of PORTAL_LINKS.office) expect(isBlockedInNativeApp(l.href)).toBe(false);
  });
  it("área do herói continua sem o menu do escritório", () => {
    expect(PORTAL_LINKS.creator.map((l) => l.key)).toEqual(["post", "newContent", "content", "agenda", "finance", "office", "team"]);
  });
  it("atalho Escritório para quem está num casting (inclusive pelo herói)", () => {
    expect(buildPortalItems(["consumer", "creator"], undefined, { hasTalent: true })[0]).toMatchObject({ key: "office", href: OFFICE_PATH });
  });
});
