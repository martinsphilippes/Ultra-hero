import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { heroPortalNavKeys } from "@/components/layout/portal-nav";
import { FORMAT_KEYS, actionOpen, answeredFormats, isActionInterest, isFormatInterest, meetingSubject, parseFormats } from "@/lib/creator-guide/format";

// Como trabalhamos (0136): guia do creator com os quatro formatos, ações abertas, projeto autoral e universos.

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("formatos", () => {
  it("são os quatro do guia, na ordem do guia", () => {
    expect(FORMAT_KEYS).toEqual(["cpa", "publi", "project", "events"]);
  });
  it("lê só o que é válido e conta as respostas", () => {
    const f = parseFormats({ cpa: { interest: "yes", note: "Beleza" }, publi: { interest: "talvez" }, tiktok: { interest: "yes" }, events: { interest: "no" } });
    expect(f).toEqual({ cpa: { interest: "yes", note: "Beleza" }, events: { interest: "no", note: "" } });
    expect(answeredFormats(f)).toBe(2);
    expect(parseFormats(null)).toEqual({});
    expect(parseFormats([1, 2])).toEqual({});
  });
  it("interesses aceitos", () => {
    expect(isFormatInterest("maybe")).toBe(true);
    expect(isFormatInterest("depends")).toBe(false);
    expect(isActionInterest("depends")).toBe(true);
    expect(isActionInterest("maybe")).toBe(false);
  });
});

describe("ações e ata", () => {
  it("ação aberta só dentro da janela", () => {
    const a = { starts_on: "2026-11-01", ends_on: "2026-12-31" };
    expect(actionOpen(a, "2026-11-07")).toBe(true);
    expect(actionOpen(a, "2026-12-31")).toBe(true);
    expect(actionOpen(a, "2027-01-01")).toBe(false);
    expect(actionOpen(a, "2026-10-31")).toBe(false);
  });
  it("assunto da ata no padrão do guia", () => {
    expect(meetingSubject("  Anitta ", "2026-11-10T15:00:00Z")).toBe("ATA | Reunião Creator | Anitta | 2026-11-10");
  });
});

describe("portal do Hero", () => {
  it("Como trabalhamos para todo mundo do portal; Universos só no casting", () => {
    expect(heroPortalNavKeys({ hero: false, casting: false })).toContain("howWeWork");
    expect(heroPortalNavKeys({ hero: true, casting: false })).not.toContain("universes");
    expect(heroPortalNavKeys({ hero: false, casting: true })).toContain("universes");
  });
});

describe("textos", () => {
  it("cada formato tem título, resumo, pontos e o aviso de que não há promessa, nos três idiomas", () => {
    for (const locale of ["pt-BR", "en", "es"]) {
      const m = JSON.parse(read(`messages/${locale}/creatorGuide.json`));
      for (const k of FORMAT_KEYS) {
        const item = m.formats.items[k];
        expect(item.title, `${locale} ${k}`).toBeTruthy();
        expect(item.summary, `${locale} ${k}`).toBeTruthy();
        expect(Object.keys(item.points).length, `${locale} ${k}`).toBeGreaterThanOrEqual(3);
        expect(item.important, `${locale} ${k}`).toBeTruthy();
      }
    }
  });
  it("em português, nenhum texto promete cachê, campanha ou patrocínio", () => {
    const m = JSON.parse(read("messages/pt-BR/creatorGuide.json"));
    const all = JSON.stringify(m).toLowerCase();
    expect(all).not.toMatch(/garantimos (a|o|sua|seu) (campanha|cachê|patrocínio)/);
    expect(m.limits.items.p1).toMatch(/Não garantimos/);
  });
});

describe("migração 0136", () => {
  const sql = read("supabase/migrations/0136_como_trabalhamos_creator.sql");
  it("tabelas sem acesso direto do app e funções fora do anon", () => {
    expect(sql).toMatch(/revoke all on public\.%I from public, anon, authenticated/);
    for (const fn of ["creator_guide_mine()", "creator_formats_save(jsonb)", "creator_universes_save(text[], uuid[], uuid[])", "creator_action_respond(text, jsonb)",
      "creator_idea_submit(jsonb)", "talent_relationship_team(uuid)", "talent_formats_save_team(uuid, jsonb)", "creator_idea_update(uuid, text, text)",
      "creator_action_answers(text)", "creator_universe_catalog()"]) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon;`);
    }
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
  });
  it("semeia a Black Friday 2026 até o fim do ano, ligada à data do calendário", () => {
    expect(sql).toMatch(/'black-friday-2026'[\s\S]*date '2026-12-31'/);
    expect(sql).toContain("e.title = 'Black Friday'");
  });
});
