import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  accessEmailSchema,
  accessErrorCode,
  accessPhoneSchema,
  contactNameSchema,
  normalizeAccessEmail,
  parseAccessProvision,
  slugifyHeroName,
  toAccessState,
} from "@/lib/agency/access-contact";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { normalizeBrMobile } from "@/lib/auth/phone";
import { INBOX_KINDS, inboxKindEmails, inboxKindPushes } from "@/lib/inbox/kinds";
import { z } from "zod";

// Acesso do Hero (Casting) e da marca criados pela agência (0112): e-mail e celular obrigatórios e normalizados.

describe("e-mail de acesso", () => {
  it("normaliza: sem espaços nas pontas e minúsculo", () => {
    expect(normalizeAccessEmail("  Novo.Heroi@Gmail.COM ")).toBe("novo.heroi@gmail.com");
    expect(accessEmailSchema.parse(" A@B.CO ")).toBe("a@b.co");
  });
  it("recusa o que não é e-mail", () => {
    for (const bad of ["", "   ", "sem-arroba", "a@b", "a b@c.com", "@c.com", 42, null, `${"a".repeat(250)}@b.com`]) expect(normalizeAccessEmail(bad)).toBeNull();
    const r = accessEmailSchema.safeParse("x");
    expect(r.success).toBe(false);
    if (!r.success) expect(accessErrorCode(r.error)).toBe("invalid_email");
  });
});

describe("celular de acesso (BR, E.164)", () => {
  it("aceita a máscara e outros formatos e guarda +55DD9XXXXXXXX", () => {
    expect(accessPhoneSchema.parse("(11) 91234-5678")).toBe("+5511912345678");
    expect(accessPhoneSchema.parse("+55 21 98765-4321")).toBe("+5521987654321");
    expect(normalizeBrMobile("011912345678")).toBe("+5511912345678");
  });
  it("recusa fixo, DDD inexistente e curto, com o código invalid_phone", () => {
    for (const bad of ["(11) 3234-5678", "(20) 91234-5678", "91234-5678", ""]) {
      const r = accessPhoneSchema.safeParse(bad);
      expect(r.success, bad).toBe(false);
      if (!r.success) expect(accessErrorCode(r.error)).toBe("invalid_phone");
    }
  });
  it("o formato do banco é o mesmo (+55, DDD sem zero, 9 na frente)", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0112_heroi_conta_vinculada.sql"), "utf8");
    const re = /\^\\\+55\[1-9\]\[1-9\]9\[0-9\]\{8\}\$/;
    expect(sql).toMatch(re);
    expect(new RegExp("^\\+55[1-9][1-9]9[0-9]{8}$").test(accessPhoneSchema.parse("(11) 91234-5678"))).toBe(true);
  });
});

describe("nome do contato da marca e erros", () => {
  it("nome com 2 a 80 letras; vazio vira name_required", () => {
    expect(contactNameSchema.parse("  Ana   Contato ")).toBe("Ana Contato");
    const r = z.object({ n: contactNameSchema }).safeParse({ n: " " });
    expect(r.success).toBe(false);
    if (!r.success) expect(accessErrorCode(r.error)).toBe("name_required");
  });
  it("códigos novos traduzidos pelo módulo (o mais específico primeiro)", () => {
    for (const code of ["hero_email_taken", "hero_email_mismatch", "invalid_phone", "contact_missing"]) {
      expect(AGENCY_ERROR_CODES).toContain(code);
      expect(agencyErrorCode({ message: code })).toBe(code);
    }
  });
});

describe("resultado das RPCs e situação", () => {
  it("convite exige token de 64 hex; ligado/ativo/aguardando sem token", () => {
    const token = "a".repeat(64);
    expect(parseAccessProvision({ account: "invited", token, expires_at: "2026-11-18T00:00:00Z" })).toEqual({ account: "invited", token, expiresAt: "2026-11-18T00:00:00Z" });
    expect(parseAccessProvision({ account: "invited", token: "curto" })).toBeNull();
    expect(parseAccessProvision({ account: "linked", talent_id: "x" })).toEqual({ account: "linked" });
    expect(parseAccessProvision({ account: "outro" })).toBeNull();
    expect(parseAccessProvision(null)).toBeNull();
    expect(parseAccessProvision([])).toBeNull();
  });
  it("situação desconhecida vira 'sem conta'", () => {
    expect(toAccessState("active")).toBe("active");
    expect(toAccessState("pending")).toBe("pending");
    expect(toAccessState("expired")).toBe("expired");
    expect(toAccessState("x")).toBe("none");
  });
  it("endereço da página a partir do nome (mesmo formato do banco)", () => {
    expect(slugifyHeroName("João da Silva!")).toBe("joao-da-silva");
    expect(slugifyHeroName("  ")).toBe("");
    expect(slugifyHeroName("a".repeat(70))).toHaveLength(60);
    expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugifyHeroName("Ana — Maria  2"))).toBe(true);
  });
});

describe("avisos e migração 0112", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0112_heroi_conta_vinculada.sql"), "utf8");
  it("dois avisos novos no check do banco; só no sino (o e-mail sai pelo app), sem push", () => {
    for (const kind of ["hero_account_linked", "brand_access_granted"]) {
      expect(INBOX_KINDS).toContain(kind);
      expect(sql).toContain(`'${kind}'`);
      expect(inboxKindEmails(kind, "/heroi")).toBe(false);
      expect(inboxKindPushes(kind, "/heroi")).toBe(false);
    }
  });
  it("toda função criada revoga do visitante; nada de drop de tabela/coluna; convites fora da pausa só nos kinds novos", () => {
    const created = [...sql.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    for (const fn of created) expect(sql, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon`));
    expect(sql).not.toMatch(/grant execute[^;]*to [^;]*anon/);
    expect(sql).not.toMatch(/drop (table|column)/i);
    expect(sql).toContain("if new.kind in ('agency_hero', 'agency_brand') then return new; end if;");
    expect(sql).toMatch(/interval '14 days'/);
  });
});
