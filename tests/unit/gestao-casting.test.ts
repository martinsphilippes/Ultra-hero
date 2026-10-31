import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { AGENCY_ROUTE_MIN, agencyNavKeys } from "@/lib/agency/roles";
import { isTalentOnly } from "@/lib/auth/talent-scope";
import { DEMO_ACCESS_ACCOUNTS, readyDemoAccounts, TALENT_DEMO_EMAIL } from "@/lib/demo/accounts";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import { buildPortalItems, buildSettingsSections, OFFICE_PATH } from "@/lib/settings/sections";

describe("etapa B: casting no menu e travas", () => {
  it("Casting para todos os níveis; Novo talento só gestor+", () => {
    expect(agencyNavKeys("staff")).toContain("casting");
    expect(AGENCY_ROUTE_MIN["/agencia/casting/novo"]).toBe("manager");
  });

  it("erros novos das RPCs viram códigos conhecidos", () => {
    for (const code of ["creator_already_in_casting", "user_has_talent", "talent_has_login", "talent_has_creator", "consent_required", "too_many_segments", "duplicate_network", "talent_archived"]) {
      expect(agencyErrorCode({ message: code })).toBe(code);
    }
  });

  it("escritório e /kit existem no app das lojas; o portal da agência não", () => {
    expect(isBlockedInNativeApp("/creator/escritorio")).toBe(false);
    expect(isBlockedInNativeApp("/kit/abc")).toBe(false);
    expect(isBlockedInNativeApp("/agencia/casting")).toBe(true);
  });
});

describe("talento sem página pública (D2)", () => {
  it("isTalentOnly só quando todo papel creator tem escopo talent", () => {
    expect(isTalentOnly([{ role: "creator", scope_type: "talent" }])).toBe(true);
    expect(isTalentOnly([{ role: "creator", scope_type: "talent" }, { role: "creator", scope_type: "creator" }])).toBe(false);
    expect(isTalentOnly([{ role: "consumer", scope_type: "global" }])).toBe(false);
  });

  it("Configurações mostram o Escritório para quem está num casting (web e app)", () => {
    const sections = buildSettingsSections(["consumer", "creator"], undefined, { hasTalent: true });
    const office = sections.find((s) => s.key === "portals")?.items.find((i) => i.key === "office");
    expect(office).toMatchObject({ kind: "portal", href: OFFICE_PATH, nativeHidden: false });
    expect(buildSettingsSections(["consumer", "creator"]).find((s) => s.key === "portals")).toBeUndefined();
  });

  it("conta talento@ só aparece no painel quando o seed da etapa B rodou", () => {
    expect(DEMO_ACCESS_ACCOUNTS.some((a) => a.kind === "talent" && a.email === TALENT_DEMO_EMAIL)).toBe(true);
    const without = readyDemoAccounts(DEMO_ACCESS_ACCOUNTS, { professional: true, agency: true, agencyStaff: true, brand: true });
    expect(without.some((a) => a.kind === "talent")).toBe(false);
    const withTalent = readyDemoAccounts(DEMO_ACCESS_ACCOUNTS, { professional: true, talent: true });
    expect(withTalent.some((a) => a.kind === "talent")).toBe(true);
    expect(readyDemoAccounts(DEMO_ACCESS_ACCOUNTS, { professional: false }).map((a) => a.kind)).toEqual(["admin", "creator", "premium", "free"]);
  });
});

describe("portais no topo do Perfil", () => {
  it("mesmos atalhos da seção Portais: Escritório primeiro, gestão para o admin geral, nada para o consumidor", () => {
    expect(buildPortalItems(["consumer"])).toEqual([]);
    expect(buildPortalItems(["consumer", "creator"], undefined, { hasTalent: true }).map((p) => p.key)).toEqual(["office"]);
    const admin = buildPortalItems(["consumer", "admin"]);
    expect(admin.map((p) => [p.key, p.href, p.nativeHidden])).toEqual([
      ["agency", "/agencia", true],
      ["brand", "/marca", true],
      ["admin", "/admin", false],
    ]);
    const portals = buildSettingsSections(["consumer", "admin"]).find((s) => s.key === "portals")?.items;
    expect(portals).toEqual(admin);
  });
});
