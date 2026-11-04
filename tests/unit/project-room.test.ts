import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_LINKS, PORTAL_ROOT } from "@/components/layout/portal-nav";
import { suggestNextDeal } from "@/lib/project-room/next-deal";
import {
  attachmentKind,
  buildShootIcs,
  checkinOpen,
  clippingHref,
  engagementRate,
  guessRoomMime,
  mapHref,
  npsBucket,
  npsScore,
  parseSystemLine,
  ROOM_MIME_TYPES,
  roomHref,
  SYSTEM_CODES,
} from "@/lib/project-room/vocab";

const SQL = readFileSync(path.join(process.cwd(), "supabase/migrations/0110_sala_projeto.sql"), "utf8");

describe("sala do projeto (0110): vocabulário", () => {
  it("links por portal iguais a public.project_room_link", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(roomHref("agency", id)).toBe(`/agencia/negocios/${id}/sala`);
    expect(roomHref("brand", id)).toBe(`/marca/projetos/${id}`);
    expect(roomHref("talent", id)).toBe(`/heroi/projetos/${id}`);
    expect(roomHref("staff", id)).toBe(`/projetos/${id}`);
    expect(clippingHref("agency", id)).toBe(`/agencia/negocios/${id}/clipping`);
    expect(clippingHref("brand", id)).toBe(`/marca/projetos/${id}/clipping`);
    expect(SQL).toContain("'/agencia/negocios/' || p_deal::text || '/sala'");
    expect(SQL).toContain("'/projetos/' || p_deal::text");
  });

  it("tipos de arquivo iguais ao banco (project_room_mime_ext e bucket)", () => {
    for (const mime of ROOM_MIME_TYPES) expect(SQL).toContain(`'${mime}'`);
    expect(guessRoomMime("audio.m4a", "")).toBe("audio/mp4");
    expect(guessRoomMime("nota.MP3", "application/octet-stream")).toBe("audio/mpeg");
    expect(guessRoomMime("foto.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(guessRoomMime("planilha.xlsx", "")).toBeNull();
    expect(attachmentKind("audio/ogg")).toBe("audio");
    expect(attachmentKind("image/png")).toBe("image");
    expect(attachmentKind("application/pdf")).toBe("pdf");
    expect(attachmentKind(null)).toBe("file");
  });

  it("linhas de sistema: código, parâmetro, data/hora local e local da diária", () => {
    expect(parseSystemLine("step_done|Aprovar o briefing da produção")).toEqual({ code: "step_done", param: "Aprovar o briefing da produção", date: null, place: "" });
    expect(parseSystemLine("shoot_day|2026-11-14T09:00|Estúdio Lapa | sala 2")).toEqual({ code: "shoot_day", param: "", date: "2026-11-14T09:00", place: "Estúdio Lapa | sala 2" });
    expect(parseSystemLine("room_archived|")).toMatchObject({ code: "room_archived", param: "" });
    expect(parseSystemLine("qualquer coisa")).toMatchObject({ code: "other", param: "qualquer coisa" });
    // todo código que o banco grava tem tradução
    for (const code of SQL.matchAll(/'([a-z_]+)\|'/g)) expect(SYSTEM_CODES as readonly string[]).toContain(code[1]);
  });

  it("NPS: promotores 9–10, neutros 7–8, detratores 0–6", () => {
    expect([0, 6, 7, 8, 9, 10].map(npsBucket)).toEqual(["detractor", "detractor", "passive", "passive", "promoter", "promoter"]);
    expect(npsScore(1, 0, 1)).toBe(0);
    expect(npsScore(3, 1, 0)).toBe(75);
    expect(npsScore(0, 0, 0)).toBeNull();
  });

  it("taxa de engajamento sobre o alcance (ou visualizações)", () => {
    expect(engagementRate(68, 1000)).toBe(6.8);
    expect(engagementRate(10, 0, 200)).toBe(5);
    expect(engagementRate(10, 0, 0)).toBeNull();
  });

  it("check-in: de 12 h antes do início a 12 h depois do fim", () => {
    const start = "2026-11-14T12:00:00.000Z";
    const end = "2026-11-14T20:00:00.000Z";
    expect(checkinOpen(start, end, new Date("2026-11-14T00:00:00.000Z"))).toBe(true);
    expect(checkinOpen(start, end, new Date("2026-11-13T23:59:00.000Z"))).toBe(false);
    expect(checkinOpen(start, end, new Date("2026-11-15T08:00:00.000Z"))).toBe(true);
    expect(checkinOpen(start, end, new Date("2026-11-15T08:01:00.000Z"))).toBe(false);
  });

  it("diária vira .ics com local, link do mapa e horário em UTC", () => {
    const ics = buildShootIcs(
      { id: "d1", title: "Diária · Clipe", location: "Estúdio Lapa", mapUrl: "https://maps.test/lapa", startsAt: "2026-11-14T12:00:00.000Z", endsAt: "2026-11-14T20:00:00.000Z" },
      "America/Sao_Paulo",
      new Date("2026-11-01T00:00:00.000Z"),
    );
    expect(ics).toContain("UID:shoot-d1@groscove-ultra");
    expect(ics).toContain("DTSTART:20261114T120000Z");
    expect(ics).toContain("LOCATION:Estúdio Lapa");
    expect(ics).toContain("URL:https://maps.test/lapa");
    expect(mapHref("Rua A, 10", null)).toBe("https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010");
    expect(mapHref("x", "http://inseguro.test")).toContain("google.com/maps");
  });

  it("portal do staff externo em /projetos", () => {
    expect(PORTAL_ROOT.project).toBe("/projetos");
    expect(PORTAL_LINKS.project.map((l) => l.href)).toEqual(["/projetos", "/projetos/avisos"]);
  });
});

describe("sala do projeto (0110): próximo negócio sugerido", () => {
  const base = { talent: "Philippe", brand: "Nike", engagementRate: null, published: 1 };
  it("produção (vídeo, foto, live) → publipost", () => {
    for (const s of ["producao-de-video", "producao-fotografica", "live-session"]) expect(suggestNextDeal({ ...base, serviceSlug: s }).service).toBe("publipost");
  });
  it("publipost forte → Live Session; fraco → outro publipost", () => {
    expect(suggestNextDeal({ ...base, serviceSlug: "publipost", engagementRate: 6.8 })).toEqual({ service: "live-session", reason: "publi_to_live", strong: true });
    expect(suggestNextDeal({ ...base, serviceSlug: "publipost", engagementRate: 1 })).toEqual({ service: "publipost", reason: "publi_repeat", strong: false });
  });
  it("mentoria → business plan → assessoria artística; recorrentes renovam; sem serviço → publipost", () => {
    expect(suggestNextDeal({ ...base, serviceSlug: "mentoria-jonathas" }).service).toBe("business-plan");
    expect(suggestNextDeal({ ...base, serviceSlug: "business-plan" }).service).toBe("assessoria-artistica");
    expect(suggestNextDeal({ ...base, serviceSlug: "assessoria-de-imprensa" }).reason).toBe("press_continue");
    expect(suggestNextDeal({ ...base, serviceSlug: null }).reason).toBe("default");
  });
});
