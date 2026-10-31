import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { agencyCan, agencyNavKeys, brandNavKeys, canSeeValues, invitableAgencyRoles, isAgencyRole, isBrandRole } from "@/lib/agency/roles";
import { brandCreateSchema, inviteMemberSchema, setRoleSchema, settingsSchema, slugFromName } from "@/lib/agency/schemas";
import { DEMO_ACCESS_ACCOUNTS, readyDemoAccounts } from "@/lib/demo/accounts";
import { INBOX_KINDS, inboxKindPushes, inboxParams, isInboxKind, safeInboxLink } from "@/lib/inbox/kinds";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import { pushAllowedFor } from "@/lib/push/consent";
import { buildPushMessage } from "@/lib/push/message";
import { buildSettingsSections } from "@/lib/settings/sections";
import { isMissingSchema } from "@/lib/supabase/helpers";

// Etapa A do módulo de gestão (0064): hierarquia, menus, avisos, demo, bloqueio no app e push do escritório.


describe("hierarquia da agência", () => {
  it("admin > manager > staff; o admin geral passa como Adm", () => {
    expect(agencyCan("staff", "staff")).toBe(true);
    expect(agencyCan("staff", "manager")).toBe(false);
    expect(agencyCan("manager", "manager")).toBe(true);
    expect(agencyCan("manager", "admin")).toBe(false);
    expect(agencyCan("admin", "admin")).toBe(true);
    expect(agencyCan(null, "staff")).toBe(false);
    expect(agencyCan(null, "admin", true)).toBe(true);
  });

  it("só o Adm da agência (ou o admin geral) vê valores", () => {
    expect(canSeeValues("admin")).toBe(true);
    expect(canSeeValues("manager")).toBe(false);
    expect(canSeeValues("staff")).toBe(false);
    expect(canSeeValues(null)).toBe(false);
    expect(canSeeValues(null, true)).toBe(true);
  });

  it("menu por nível: Equipe só para o Adm, Configurações para gestor+", () => {
    expect(agencyNavKeys("staff")).toEqual(["dashboard", "casting", "brands", "notifications"]);
    expect(agencyNavKeys("manager")).toEqual(["dashboard", "casting", "brands", "notifications", "settings"]);
    expect(agencyNavKeys("admin")).toEqual(["dashboard", "casting", "brands", "notifications", "settings", "team"]);
    expect(agencyNavKeys(null, true)).toContain("team");
    expect(brandNavKeys()).toEqual(["dashboard", "team", "notifications"]);
  });

  it("só o Adm convida a equipe, em qualquer nível", () => {
    expect(invitableAgencyRoles("admin")).toEqual(["admin", "manager", "staff"]);
    expect(invitableAgencyRoles("manager")).toEqual([]);
    expect(invitableAgencyRoles("staff")).toEqual([]);
  });

  it("valida os papéis", () => {
    expect(isAgencyRole("manager")).toBe(true);
    expect(isAgencyRole("owner")).toBe(false);
    expect(isBrandRole("owner")).toBe(true);
    expect(isBrandRole("admin")).toBe(false);
  });
});

describe("formulários", () => {
  it("convite: e-mail normalizado, papel da lista e validade 1..30", () => {
    expect(inviteMemberSchema.parse({ email: " Ana@Exemplo.COM ", role: "staff", days: "14" })).toEqual({ email: "ana@exemplo.com", role: "staff", days: 14 });
    expect(inviteMemberSchema.parse({ email: "a@b.co", role: "admin", days: 99 }).days).toBe(7);
    expect(inviteMemberSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "nao-e-email", role: "staff" }).success).toBe(false);
  });

  it("troca de papel exige justificativa de 5+ caracteres", () => {
    expect(setRoleSchema.safeParse({ userId: "74000000-0000-4000-8000-0000000000a1", role: "manager", justification: "ok" }).success).toBe(false);
    expect(setRoleSchema.safeParse({ userId: "74000000-0000-4000-8000-0000000000a1", role: "manager", justification: "promoção" }).success).toBe(true);
  });

  it("marca: endereço curto, site https e logo opcional", () => {
    expect(brandCreateSchema.safeParse({ name: "X", slug: "marca-x", siteUrl: "https://example.com", logoUrl: "" }).success).toBe(true);
    expect(brandCreateSchema.safeParse({ name: "X", slug: "Marca X", siteUrl: "https://example.com" }).success).toBe(false);
    expect(brandCreateSchema.safeParse({ name: "X", slug: "marca-x", siteUrl: "http://example.com" }).success).toBe(false);
    expect(slugFromName("Marca Ótima Já!")).toBe("marca-otima-ja");
    expect(slugFromName("  --  ")).toBe("");
  });

  it("configurações: alerta de 7 a 365 dias", () => {
    const base = { name: "Agência", timezone: "America/Sao_Paulo", contactEmail: "" };
    expect(settingsSchema.safeParse({ ...base, relationshipAlertDays: "30" }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, relationshipAlertDays: 3 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, relationshipAlertDays: 400 }).success).toBe(false);
  });
});

describe("erros das RPCs", () => {
  it("acha o código mais específico na mensagem", () => {
    expect(agencyErrorCode({ message: "last_agency_admin" })).toBe("last_agency_admin");
    expect(agencyErrorCode({ message: "demo_account_forbidden" })).toBe("demo_account_forbidden");
    expect(agencyErrorCode(new Error("new row violates check constraint \"x_check\""))).toBe("invalid_input");
    expect(agencyErrorCode("coisa estranha")).toBe("generic");
  });

  it("todo código tem mensagem nos três idiomas", () => {
    for (const locale of ["pt-BR", "en", "es"]) {
      const agency = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "agency.json"), "utf8")) as { errors: Record<string, string> };
      for (const code of ["demo_account_forbidden", "last_agency_admin", "brand_linked_elsewhere", "invalid_input", "generic"]) {
        expect(agency.errors[code], `${locale} ${code}`).toBeTruthy();
      }
    }
  });
});

describe("avisos", () => {
  it("25 tipos, iguais ao check do banco", () => {
    expect(INBOX_KINDS).toHaveLength(25);
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0064_gestao_fundacao.sql"), "utf8");
    for (const kind of INBOX_KINDS) expect(sql).toContain(`'${kind}'`);
    expect(isInboxKind("member_joined")).toBe(true);
    expect(isInboxKind("auction_outbid")).toBe(false);
  });

  it("push só para tipos do escritório com link do escritório", () => {
    expect(inboxKindPushes("task_assigned", "/creator/escritorio/tarefas")).toBe(true);
    expect(inboxKindPushes("task_assigned", "/agencia/tarefas")).toBe(false);
    expect(inboxKindPushes("member_joined", "/creator/escritorio")).toBe(false);
  });

  it("parâmetros só de texto curto e links só internos", () => {
    expect(inboxParams({ name: "Ana", n: 3, obj: { a: 1 }, long: "x".repeat(200) })).toEqual({ name: "Ana", n: "3", long: "x".repeat(120) });
    expect(inboxParams(null)).toEqual({});
    expect(safeInboxLink("/agencia/equipe")).toBe("/agencia/equipe");
    expect(safeInboxLink("//evil.com")).toBe("/");
    expect(safeInboxLink("https://evil.com")).toBe("/");
    expect(safeInboxLink("/x\"onclick")).toBe("/");
  });

  it("todo tipo tem título e corpo nos três idiomas, com os mesmos tokens", () => {
    for (const locale of ["pt-BR", "en", "es"]) {
      const inbox = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "inbox.json"), "utf8")) as { kinds: Record<string, { title: string; body: string }> };
      for (const kind of INBOX_KINDS) expect(inbox.kinds[kind]?.title && inbox.kinds[kind]?.body, `${locale} ${kind}`).toBeTruthy();
    }
  });
});

describe("push do escritório", () => {
  it("opt-in: canal Push + avisos do escritório", () => {
    expect(pushAllowedFor({ channel_push: true, office_updates: true }, "office")).toBe(true);
    expect(pushAllowedFor({ channel_push: true, office_updates: false }, "office")).toBe(false);
    expect(pushAllowedFor({ channel_push: false, office_updates: true }, "office")).toBe(false);
    expect(pushAllowedFor({ channel_push: true }, "office")).toBe(false);
  });

  it("texto vem do tipo do aviso e o link é o do aviso", () => {
    const messages = JSON.parse(readFileSync(path.join(process.cwd(), "messages", "pt-BR", "push.json"), "utf8"));
    const msg = buildPushMessage({ kind: "office", inboxKind: "task_assigned", params: { deal: "Campanha Verão" }, link: "/creator/escritorio/tarefas" }, "pt-BR", messages);
    expect(msg).toEqual({ title: "Nova tarefa", body: "Você tem uma tarefa nova em Campanha Verão.", url: "/creator/escritorio/tarefas" });
  });
});

describe("integração com o app", () => {
  it("portais de gestão só na web", () => {
    expect(isBlockedInNativeApp("/agencia")).toBe(true);
    expect(isBlockedInNativeApp("/agencia/equipe")).toBe(true);
    expect(isBlockedInNativeApp("/marca")).toBe(true);
    expect(isBlockedInNativeApp("/marcas")).toBe(false);
    expect(isBlockedInNativeApp("/creator/post/new")).toBe(false);
  });

  it("Configurações mostram os portais de agência e marca (escondidos no app)", () => {
    const portals = buildSettingsSections(["consumer", "agency", "brand"]).find((s) => s.key === "portals");
    expect(portals?.items.map((i) => i.key)).toEqual(["agency", "brand"]);
    expect(portals?.items.every((i) => i.nativeHidden)).toBe(true);
  });

  it("contas demo da gestão só aparecem quando prontas", () => {
    const off = readyDemoAccounts(DEMO_ACCESS_ACCOUNTS, { professional: false }).map((a) => a.kind);
    expect(off).not.toContain("agency");
    const on = readyDemoAccounts(DEMO_ACCESS_ACCOUNTS, { professional: false, agency: true, agencyStaff: true, brand: false }).map((a) => a.kind);
    expect(on).toEqual(["admin", "creator", "premium", "free", "agency", "agencyStaff"]);
  });

  it("migração ausente vira 'indisponível' (sem erro 500)", () => {
    for (const code of ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"]) expect(isMissingSchema({ code })).toBe(true);
    expect(isMissingSchema({ code: "42501" })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });
});

describe("iniciais do avatar", () => {
  it("ignora parênteses e sinais", async () => {
    const { initials } = await import("@/lib/utils");
    expect(initials("Adm da agência (exemplo)")).toBe("AD");
    expect(initials("Colaborador (exemplo)")).toBe("CE");
    expect(initials("(Bia) Treinos")).toBe("BT");
    expect(initials("Érick Jacquin")).toBe("ÉJ");
    expect(initials("  ")).toBe("");
  });
});

describe("atalhos de portal do admin geral", () => {
  it("admin vê Agência e Marca em Configurações → Portais, antes da Administração", () => {
    const portals = buildSettingsSections(["consumer", "admin"]).find((s) => s.key === "portals");
    expect(portals?.items.map((i) => i.key)).toEqual(["agency", "brand", "admin"]);
  });
});
