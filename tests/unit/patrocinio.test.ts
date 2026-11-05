import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AbstractIntlMessages } from "next-intl";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { AGENCY_ROUTE_MIN, agencyNavKeys, brandNavKeys } from "@/lib/agency/roles";
import { EVENT_KINDS, isEventKind } from "@/lib/calendar/vocab";
import { buildWorkEmail } from "@/lib/email/work-message";
import { INBOX_KINDS, inboxKindEmails, inboxKindPushes } from "@/lib/inbox/kinds";
import {
  brandCanRespond,
  canDecide,
  localParts,
  parsePerks,
  perksValid,
  responseCounts,
  sponsorshipInstants,
  sponsorshipSchema,
  toAgencySponsorshipDetail,
  toAgencySponsorships,
  toBrandSponsorships,
  toTalentSponsorships,
} from "@/lib/sponsorship/vocab";
import { buildBrandToday, type BrandWorkboard } from "@/lib/today/logic";

const TZ = "America/Sao_Paulo";
const UUID = "11111111-1111-4111-8111-111111111111";
const base = {
  id: null,
  // 0095: o Hero (ficha do casting) e se publica
  hero: { kind: "talent" as const, talentId: UUID, creatorId: null, name: "Ana", slug: null, avatarUrl: null, headline: null, pillars: [], consent: "active" as const, profile: "", email: "" },
  publish: true,
  title: "Maratona do Rio",
  description: "",
  location: "Rio",
  date: "2026-11-20",
  endDate: "",
  startTime: "08:00",
  endTime: "13:00",
  allDay: false,
  expectedReach: "5.000",
  perks: ["Logo na camiseta"],
  networks: ["instagram" as const],
  respondDate: "2026-11-15",
  respondTime: "18:00",
  audience: "all" as const,
  brandIds: [],
  // 0088: cotas e público do evento
  tiers: [{ id: null, name: "Cota única", priceCents: null, perks: ["Logo na camiseta"], slots: 1 }],
  public: { targetAudience: "", targetAgeBands: [], targetStates: [], regionNote: "" },
};

describe("contrapartidas (mesma regra de public.sponsorship_perks_valid)", () => {
  it("uma por linha, limpa espaços e repetidas", () => {
    expect(parsePerks("  Logo na camiseta \n\n3  stories ao vivo\nlogo NA camiseta")).toEqual(["Logo na camiseta", "3 stories ao vivo"]);
  });
  it("até 10, de 3 a 120 letras, sem repetir", () => {
    expect(perksValid(["Logo", "Live"])).toBe(true);
    expect(perksValid(["ab"])).toBe(false);
    expect(perksValid(["Logo", "logo"])).toBe(false);
    expect(perksValid(Array.from({ length: 11 }, (_, i) => `Item ${i}`))).toBe(false);
    expect(perksValid(["x".repeat(121)])).toBe(false);
  });
});

describe("formulário da agência", () => {
  it("público escolhido exige marca; rede obrigatória", () => {
    expect(sponsorshipSchema.safeParse(base).success).toBe(true);
    expect(sponsorshipSchema.safeParse({ ...base, audience: "selected" }).success).toBe(false);
    expect(sponsorshipSchema.safeParse({ ...base, audience: "selected", brandIds: [UUID] }).success).toBe(true);
    expect(sponsorshipSchema.safeParse({ ...base, networks: [] }).success).toBe(false);
    expect(sponsorshipSchema.safeParse({ ...base, perks: ["ab"] }).success).toBe(false);
  });
  it("instantes no fuso da agência; dia inteiro com fim exclusivo; sem fim = 2 horas", () => {
    expect(sponsorshipInstants(base, TZ)).toEqual({ startsAt: "2026-11-20T08:00:00-03:00", endsAt: "2026-11-20T13:00:00-03:00", respondBy: "2026-11-15T18:00:00-03:00" });
    const allDay = sponsorshipInstants({ ...base, allDay: true, endDate: "2026-11-21" }, TZ);
    expect(allDay?.startsAt).toBe("2026-11-20T00:00:00-03:00");
    expect(allDay?.endsAt).toBe("2026-11-22T00:00:00-03:00");
    const noEnd = sponsorshipInstants({ ...base, endTime: "" }, TZ);
    expect(Date.parse(noEnd!.endsAt) - Date.parse(noEnd!.startsAt)).toBe(2 * 3600_000);
    expect(sponsorshipInstants({ ...base, endTime: "07:00" }, TZ)).toBeNull();
  });
  it("partes locais para a edição", () => {
    expect(localParts("2026-11-20T11:00:00Z", TZ)).toEqual({ date: "2026-11-20", time: "08:00" });
  });
});

describe("leituras fechadas", () => {
  it("lista e ficha da agência", () => {
    const [row] = toAgencySponsorships([{ id: "o1", title: "M", status: "closed", closed_reason: "deadline", audience: "selected", audience_count: 3, interested: 1, declined: 1, winners: [] }]);
    expect(row.closedReason).toBe("deadline");
    expect(row.audienceCount).toBe(3);
    const d = toAgencySponsorshipDetail({
      opportunity: { id: "o1", title: "M", status: "open", audience: "all", perks: ["Logo"], networks: ["instagram", "orkut"], target_ids: [] },
      brands: [
        { brand_id: "b1", name: "Alfa", response: "interested", message: "Sim" },
        { brand_id: "b2", name: "Beta", response: "declined" },
        { brand_id: "b3", name: "Gama", response: null },
      ],
    });
    expect(d?.networks).toEqual(["instagram"]);
    expect(responseCounts(d!.brands)).toEqual({ interested: 1, declined: 1, pending: 1 });
    expect(canDecide(d!)).toBe(true);
    expect(canDecide({ status: "closed", decidedAt: null })).toBe(true);
    expect(canDecide({ status: "sponsored", decidedAt: "2026-11-01" })).toBe(false);
    expect(toAgencySponsorshipDetail(null)).toBeNull();
  });
  it("marca: situação e o que ainda pode responder (recusa vira interesse; interesse não volta)", () => {
    const [open, declined, interested, expired] = toBrandSponsorships([
      { id: "a", status: "open", talent: { id: "t", name: "Ana", in_catalog: false } },
      { id: "b", status: "open", my_response: { response: "declined" } },
      { id: "c", status: "open", my_response: { response: "interested", request_id: "r1" } },
      { id: "d", status: "expired" },
    ]);
    expect(open.talent.inCatalog).toBe(false);
    expect(brandCanRespond(open)).toEqual({ interested: true, declined: true });
    expect(brandCanRespond(declined)).toEqual({ interested: true, declined: false });
    expect(brandCanRespond(interested)).toEqual({ interested: false, declined: false });
    expect(interested.myResponse?.requestId).toBe("r1");
    expect(brandCanRespond(expired)).toEqual({ interested: false, declined: false });
  });
  it("creator: só as vencedoras", () => {
    expect(toTalentSponsorships([{ id: "a", status: "sponsored", sponsors: ["Alfa"] }])[0].sponsors).toEqual(["Alfa"]);
  });
});

describe("Hoje da marca", () => {
  const wb: BrandWorkboard = { role: "staff", timezone: TZ, campaigns: [], talents: [], deliverables: [], scriptApprovals: [], termsPending: [], threads: [] };
  const now = new Date("2026-11-10T12:00:00Z");
  const sp = (id: string, extra: Partial<{ open: boolean; answered: boolean; respondBy: string }>) => ({ id, title: `T${id}`, talentName: "Ana", respondBy: "2026-11-11T21:00:00Z", open: true, answered: false, ...extra });
  it("aberta, no prazo e sem resposta entra; respondida, encerrada ou vencida, não", () => {
    const items = buildBrandToday(wb, now, { sponsorships: [sp("a", {}), sp("b", { answered: true }), sp("c", { open: false }), sp("d", { respondBy: "2026-11-09T00:00:00Z" })] });
    expect(items.map((i) => i.key)).toEqual(["sponsorship:a"]);
    expect(items[0].href).toBe("/marca/oportunidades/a");
    expect(items[0].urgency).toBe("soon");
  });
  it("quem só lê (admin geral) não tem a pendência", () => {
    expect(buildBrandToday({ ...wb, role: null }, now, { sponsorships: [sp("a", {})] })).toHaveLength(0);
  });
});

describe("avisos, e-mail, agenda e menu", () => {
  it("três avisos novos, no check da 0085; e-mail para a parte certa; nenhum vira push", () => {
    // o check de tipos de aviso mais recente é o da 0112 (0085 + 0088 + chamada da marca + verba e pagamentos + roteiros + repasse + acesso)
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0112_heroi_conta_vinculada.sql"), "utf8");
    for (const kind of INBOX_KINDS) expect(sql).toContain(`'${kind}'`);
    expect(inboxKindEmails("sponsorship_published", "/marca/oportunidades/x")).toBe(true);
    expect(inboxKindEmails("sponsorship_published", "/agencia/oportunidades/x")).toBe(false);
    expect(inboxKindEmails("sponsorship_interest", "/agencia/oportunidades/x")).toBe(true);
    expect(inboxKindEmails("sponsorship_decided", "/heroi/agenda")).toBe(true);
    expect(inboxKindPushes("sponsorship_decided", "/heroi/agenda")).toBe(false);
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
  });
  it("e-mails nos 3 idiomas com título, creator e situação", () => {
    for (const locale of ["pt-BR", "en", "es"] as const) {
      const messages = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "email.json"), "utf8")) as AbstractIntlMessages;
      for (const status of ["won", "closed", "cancelled", "sponsored"]) {
        const email = buildWorkEmail({ kind: "sponsorship_decided", params: { title: "Maratona", status, brand: "Alfa" }, link: "/marca/oportunidades/x", origin: "https://app.test", locale, messages });
        expect(email?.subject).toContain("Maratona");
      }
      const published = buildWorkEmail({ kind: "sponsorship_published", params: { title: "Maratona", talent: "Ana", date: "2026-11-15 18:00" }, link: "/marca/oportunidades/x", origin: "https://app.test", locale, messages });
      expect(published?.text).toContain("Ana");
      expect(published?.text).toContain("https://app.test/marca/oportunidades/x");
    }
  });
  it("evento de agenda novo e menus por papel", () => {
    expect(EVENT_KINDS).toContain("sponsorship");
    expect(isEventKind("sponsorship")).toBe(true);
    expect(agencyNavKeys("staff")).not.toContain("sponsorships");
    expect(agencyNavKeys("manager")).toContain("sponsorships");
    expect(brandNavKeys()).toContain("sponsorships");
    expect(AGENCY_ROUTE_MIN["/agencia/oportunidades"]).toBe("manager");
  });
  it("erros novos traduzidos", () => {
    for (const c of ["deadline_passed", "already_responded", "not_interested"]) {
      expect(AGENCY_ERROR_CODES).toContain(c);
      expect(agencyErrorCode({ message: c })).toBe(c);
    }
  });
});
