import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countdownParts, LAUNCH_AT, launchDateLabel, resolveLaunchAt } from "@/lib/launch";
import {
  cleanTag,
  launchLeadFieldErrors,
  launchLeadSchema,
  launchLeadsCsv,
  launchLeadsCsvFilename,
  launchTagsFrom,
  normalizeInstagram,
  parseLaunchLeadsPage,
  parseLeadKindFilter,
  shortUserAgent,
} from "@/lib/launch-leads";
import { resolveShopOpensAt, SHOP_OPENS_AT, countdownParts as shopCountdownParts } from "@/lib/shop/coming-soon";

// Teaser de lançamento: data única (loja = teaser), validação do formulário e planilha do admin (0117).

describe("lançamento compartilhado com a loja", () => {
  it("a loja e o teaser contam a MESMA data (01/01/2027 00h de São Paulo)", () => {
    expect(SHOP_OPENS_AT).toBe(LAUNCH_AT);
    expect(resolveLaunchAt({})).toBe("2027-01-01T03:00:00.000Z");
    expect(resolveShopOpensAt({ SHOP_OPENS_AT: "2027-02-01T03:00:00Z" })).toBe(resolveLaunchAt({ SHOP_OPENS_AT: "2027-02-01T03:00:00Z" }));
    expect(shopCountdownParts).toBe(countdownParts);
    expect(launchDateLabel("2027-01-01T03:00:00Z")).toBe("01.01.2027");
    // 02:59Z ainda é 31/12 em São Paulo
    expect(launchDateLabel("2027-01-01T02:59:00Z")).toBe("31.12.2026");
  });
});

const base = { kind: "publico", name: "  Ana   Souza ", phone: "(11) 91234-5678", email: " Ana@Email.COM ", consent: "on", instagram: null };

describe("formulário \"Seja o primeiro a saber\"", () => {
  it("normaliza nome, celular (E.164) e e-mail (minúsculo)", () => {
    const r = launchLeadSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({ kind: "publico", name: "Ana Souza", phone: "+5511912345678", email: "ana@email.com", consent: true, instagram: null });
  });
  it("caixinha obrigatória", () => {
    const r = launchLeadSchema.safeParse({ ...base, consent: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(launchLeadFieldErrors(r.error)).toEqual({ consent: "consentRequired" });
  });
  it("erros por campo com chaves de tradução", () => {
    const r = launchLeadSchema.safeParse({ ...base, name: "x1", phone: "1234", email: "nada" });
    expect(r.success).toBe(false);
    if (!r.success) expect(launchLeadFieldErrors(r.error)).toEqual({ name: "nameInvalid", phone: "phoneInvalid", email: "emailInvalid" });
    const empty = launchLeadSchema.safeParse({ ...base, name: "", phone: "", email: "" });
    if (!empty.success) expect(launchLeadFieldErrors(empty.error)).toEqual({ name: "required", phone: "required", email: "required" });
  });
  it("só público ou influenciador (sem empresas)", () => {
    expect(launchLeadSchema.safeParse({ ...base, kind: "empresa" }).success).toBe(false);
    expect(launchLeadSchema.safeParse({ ...base, kind: "influenciador" }).success).toBe(true);
  });
  it("@ do Instagram: aceita @, link e espaços; vazio vira null; inválido recusa", () => {
    expect(normalizeInstagram("@Ana.Silva")).toBe("ana.silva");
    expect(normalizeInstagram("https://www.instagram.com/ana_silva/?hl=pt")).toBe("ana_silva");
    expect(normalizeInstagram("  ")).toBeNull();
    expect(normalizeInstagram(null)).toBeNull();
    expect(normalizeInstagram("ana silva")).toBeUndefined();
    expect(normalizeInstagram("a".repeat(31))).toBeUndefined();
    const r = launchLeadSchema.safeParse({ ...base, kind: "influenciador", instagram: "@@ errado" });
    if (!r.success) expect(launchLeadFieldErrors(r.error)).toEqual({ instagram: "instagramInvalid" });
    else throw new Error("deveria recusar");
  });
  it("origem e UTM: curtas e seguras", () => {
    expect(cleanTag("instagram")).toBe("instagram");
    expect(cleanTag("<script>")).toBeNull();
    expect(cleanTag("x".repeat(200))?.length).toBe(80);
    expect(launchTagsFrom({ utm_source: ["ig", "fb"], utm_campaign: "lançamento-2027" }, "conheca")).toEqual({ source: "conheca", utmSource: "ig", utmMedium: null, utmCampaign: "lançamento-2027" });
    expect(shortUserAgent("a\nb")).toBe("a b");
    expect(shortUserAgent("x".repeat(300))?.length).toBe(200);
  });
});

describe("admin: lista e planilha", () => {
  const rpc = {
    totals: { publico: 2, influenciador: 1, all: 3 },
    filtered: 3,
    rows: [
      { id: "1", kind: "influenciador", name: "Ana", phone: "+5511912345678", email: "ana@x.com", instagram: "ana", consent_at: "2026-11-04T10:00:00Z", created_at: "2026-11-04T10:00:00Z", updated_at: "2026-11-04T10:00:00Z" },
      { id: "2", kind: "publico", name: "=HYPERLINK(\"x\")", phone: "+5521998765432", email: "b@x.com", utm_source: "ig", consent_at: "2026-11-04", created_at: "2026-11-04", updated_at: "2026-11-04" },
      { id: "3", kind: "empresa", name: "fora", phone: "+5511", email: "c@x.com" },
    ],
  };
  it("lê a resposta da RPC e descarta linha inválida", () => {
    const page = parseLaunchLeadsPage(rpc);
    expect(page.totals).toEqual({ publico: 2, influenciador: 1, all: 3 });
    expect(page.rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(page.rows[0]?.instagram).toBe("ana");
    expect(parseLaunchLeadsPage(null)).toEqual({ totals: { publico: 0, influenciador: 0, all: 0 }, filtered: 0, rows: [] });
    expect(parseLeadKindFilter("influenciador")).toBe("influenciador");
    expect(parseLeadKindFilter("empresa")).toBeNull();
  });
  it("planilha com BOM, cabeçalho em português, celular legível e fórmulas neutralizadas", () => {
    const csv = launchLeadsCsv(parseLaunchLeadsPage(rpc).rows);
    expect(csv.startsWith("﻿tipo,nome,celular,celular_e164,email,instagram")).toBe(true);
    expect(csv).toContain("influenciador,Ana,(11) 91234-5678,'+5511912345678,ana@x.com,ana,");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(launchLeadsCsvFilename("publico", new Date("2026-11-04T12:00:00Z"))).toBe("groscove-ultra-interessados-publico-2026-11-04.csv");
    expect(launchLeadsCsvFilename(null, new Date("2026-11-04T12:00:00Z"))).toBe("groscove-ultra-interessados-2026-11-04.csv");
  });
});

describe("segurança da gravação", () => {
  const root = process.cwd();
  it("a server action usa o service role, o campo-isca e o limite por IP; nenhuma RPC para o visitante", () => {
    const action = readFileSync(path.join(root, "src/app/conheca/actions.ts"), "utf8");
    expect(action).toContain("createAdminClient()");
    expect(action).toContain("LAUNCH_HONEYPOT_FIELD");
    expect(action).toContain("LAUNCH_LEAD_LIMITS");
    expect(action).toContain('onConflict: "email,kind"');
    const sql = readFileSync(path.join(root, "supabase/migrations/0117_teaser_lancamento.sql"), "utf8");
    expect(sql).toMatch(/revoke all on table public\.launch_leads from public, anon, authenticated/);
    expect(sql).toMatch(/revoke execute on function public\.admin_launch_leads\(text, int, int\) from public, anon/);
    expect(sql).not.toMatch(/grant [^;]*to anon/i);
  });
});
