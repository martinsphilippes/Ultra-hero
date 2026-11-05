import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { INBOX_KINDS } from "@/lib/inbox/kinds";

// "Mostrar para a marca" (0121): RPC fechada para o visitante, kind de aviso já existente, erros traduzidos e textos
// nos três idiomas.
const root = process.cwd();
const sql = readFileSync(
  path.join(root, "supabase/migrations/0121_mostrar_para_marca.sql"),
  "utf8",
);
const read = (loc: string, ns: string) =>
  JSON.parse(
    readFileSync(path.join(root, "messages", loc, `${ns}.json`), "utf8"),
  );

describe("mostrar para a marca (0121)", () => {
  it("a RPC é security definer com search_path fixo e revogada do visitante; nada de drop", () => {
    expect(sql).toMatch(
      /create or replace function public\.agency_deal_set_brand_visible\(p_deal uuid, p_visible boolean\)/,
    );
    expect(sql).toMatch(/security definer set search_path = ''/);
    expect(sql).toMatch(
      /revoke execute on function public\.agency_deal_set_brand_visible\(uuid, boolean\) from public, anon;/,
    );
    expect(sql).not.toMatch(/grant [^;]*to anon/i);
    expect(sql).not.toMatch(/drop (table|column)/i);
    // mesmo critério das ações do negócio: gestor+ ou responsável/equipe
    expect(sql).toContain("public.deal_write_scope(p_deal, true, true)");
  });

  it("avisa a marca com um kind que já existe (nenhum kind novo)", () => {
    const kinds = [
      ...sql.matchAll(/inbox_notify_brand\([^,]+, [^,]+, '([a-z_]+)'/g),
    ].map((m) => m[1]);
    expect(kinds).toEqual(["campaign_status_changed"]);
    for (const k of kinds) expect(INBOX_KINDS).toContain(k);
    expect(sql).not.toMatch(/inbox_notifications_kind_check/);
  });

  it("erros novos têm código e mensagem nos três idiomas; textos do controle, do card e do histórico", () => {
    expect(agencyErrorCode({ message: "brand_required" })).toBe(
      "brand_required",
    );
    expect(agencyErrorCode({ message: "already_confirmed" })).toBe(
      "already_confirmed",
    );
    for (const loc of ["pt-BR", "en", "es"]) {
      const a = read(loc, "agency");
      expect(a.errors.brand_required).toBeTruthy();
      expect(a.errors.already_confirmed).toBeTruthy();
      expect(a.deal.system.brand_shown).toBeTruthy();
      expect(a.deal.system.brand_hidden).toBeTruthy();
      expect(a.deal.brandVisibility.show).toBeTruthy();
      expect(a.pipeline.internal).toBeTruthy();
      const i = read(loc, "inbox");
      expect(i.kinds.campaign_status_changed.title).toContain(" shared {");
      expect(i.kinds.campaign_status_changed.body).toContain(" shared {");
    }
  });
});
