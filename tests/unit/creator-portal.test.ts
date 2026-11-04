import { describe, expect, it } from "vitest";
import { PORTAL_LINKS, PORTAL_ROOT, heroPortalNavKeys } from "@/components/layout/portal-nav";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { HERO_PORTAL_HOME, portalHomeForAccepted } from "@/lib/auth/invite-home";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import { buildPortalItems, HERO_PORTAL_PATH } from "@/lib/settings/sections";
import { canInviteCreator, resolveTalentAccess, talentAccessVariant, toTalentAccess } from "@/lib/talent/access";

// Bloco 10 (0087): login do creator com herói ligado e o escritório como portal. As regras do banco
// (quem convida, recusas, aceite ligando ao herói) são testadas no S94.

describe("aceite do convite do escritório", () => {
  it("convite da ficha com herói (escopo creator + talent_id) abre o Portal do Herói", () => {
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", scope_id: "c1", talent_id: "t1" }])).toBe(HERO_PORTAL_HOME);
    expect(HERO_PORTAL_HOME).toBe("/heroi");
  });
  it("convite de herói do admin (sem ficha) e ficha sem herói: sempre o Portal do Herói (0097)", () => {
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "creator", scope_id: "c1" }])).toBe(HERO_PORTAL_HOME);
    expect(portalHomeForAccepted([{ role: "creator", scope_type: "talent", scope_id: "t1", talent_id: "t1" }])).toBe(HERO_PORTAL_HOME);
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

describe("Portal do Herói (0097: um portal só)", () => {
  it("raiz em /heroi e todos os itens dentro dela, em grupos (Conteúdo, Trabalho, Perfil)", () => {
    expect(PORTAL_ROOT.creator).toBe(HERO_PORTAL_PATH);
    expect(PORTAL_LINKS.creator.every((l) => l.href === HERO_PORTAL_PATH || l.href.startsWith(`${HERO_PORTAL_PATH}/`))).toBe(true);
    expect(new Set(PORTAL_LINKS.creator.map((l) => l.group).filter(Boolean))).toEqual(new Set(["content", "work", "profile"]));
    expect(Object.keys(PORTAL_ROOT)).not.toContain("office");
  });
  it("nada do portal é bloqueado no app das lojas", () => {
    for (const l of PORTAL_LINKS.creator) expect(isBlockedInNativeApp(l.href)).toBe(false);
  });
  it("itens da agência só no casting; conteúdo só com herói; agenda e financeiro para os dois", () => {
    const hero = heroPortalNavKeys({ hero: true, casting: false });
    expect(hero).toEqual(expect.arrayContaining(["home", "post", "newContent", "content", "recipes", "agenda", "finance", "publicPage", "team", "notifications"]));
    expect(hero).not.toContain("opportunities");
    expect(hero).not.toContain("kit");
    const talent = heroPortalNavKeys({ hero: false, casting: true });
    expect(talent).toEqual(expect.arrayContaining(["home", "opportunities", "tasks", "agenda", "finance", "availability", "kit", "portfolio", "documents", "consent", "notifications"]));
    expect(talent).not.toContain("post");
    expect(heroPortalNavKeys({ hero: true, casting: true })).toEqual(PORTAL_LINKS.creator.map((l) => l.key));
    expect(heroPortalNavKeys({ hero: false, casting: false })).toEqual(["home", "team", "notifications"]);
  });
  it("um atalho só: Portal do Herói para quem tem herói ou está num casting", () => {
    expect(buildPortalItems(["consumer", "creator"], undefined, { hasTalent: true })).toEqual([{ kind: "portal", key: "creator", href: HERO_PORTAL_PATH, nativeHidden: false }]);
    expect(buildPortalItems(["consumer", "creator"]).map((p) => p.key)).toEqual(["creator"]);
    expect(buildPortalItems(["consumer"], undefined, { hasTalent: true }).map((p) => p.key)).toEqual(["creator"]);
  });
});
