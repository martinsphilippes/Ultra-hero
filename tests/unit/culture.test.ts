import { describe, expect, it } from "vitest";
import {
  callPrefill,
  campaignPrefill,
  defaultRespondDate,
  descriptionWithTags,
  eventDayRange,
  proposalPeriod,
  segmentSlugsFor,
  sponsorshipPrefill,
  TERRITORY_SEGMENTS,
  type PrefillEvent,
} from "@/lib/culture/prefill";
import { culturePeriod, displayTag, isHappening, parseCommercial, parseCultureMeta, parseOpportunities, selectCulture, type CultureEventLike } from "@/lib/culture/select";
import { effectivePostStatus, isHttpsUrl, parseWeek, planByDay, postSchema, weekDays, weekStartOf } from "@/lib/editorial/vocab";
import { TERRITORIES } from "@/lib/platform-calendar/vocab";
import { compatFromInterests } from "@/lib/culture/compat";
import { commercialHref, eventHref, newSponsorshipHref } from "@/lib/culture/links";

const NOW = new Date("2026-11-04T15:00:00Z"); // 12:00 em Brasília
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function ev(id: string, startOffset: number, endOffset: number, extra: Partial<CultureEventLike> = {}): CultureEventLike {
  return { id, startsAt: day(startOffset), endsAt: day(endOffset), highlight: false, territory: null, effective: "published", ...extra };
}

describe("Real-Time Culture: faixas", () => {
  const events = [
    ev("agora", -0.1, 0.2),
    ev("temporada", -100, 60, { territory: "futebol" }),
    ev("amanha", 1, 1.5, { territory: "musica" }),
    ev("semana", 6.9, 7.2, { highlight: true, territory: "futebol" }),
    ev("mes", 8, 9, { territory: "futebol" }),
    ev("longe", 31, 32, { highlight: true }),
    ev("acabou", -2, -1),
    ev("cancelado", 2, 3, { effective: "cancelled" }),
    ev("destaque-agora", -0.5, 0.5, { highlight: true }),
  ];

  it("separa agora, temporadas, destaques, 7 e 30 dias; ignora encerrado, cancelado e além de 30 dias", () => {
    const lanes = selectCulture(events, NOW);
    expect(lanes.happening.map((e) => e.id)).toEqual(["agora", "destaque-agora"]);
    expect(lanes.seasons.map((e) => e.id)).toEqual(["temporada"]);
    // o destaque que já está acontecendo fica só em "Acontecendo agora" (não se repete)
    expect(lanes.featured.map((e) => e.id)).toEqual(["semana"]);
    expect(lanes.next7.map((e) => e.id)).toEqual(["amanha", "semana"]);
    expect(lanes.next30.map((e) => e.id)).toEqual(["mes"]);
  });

  it("filtro por território vale para todas as faixas", () => {
    const lanes = selectCulture(events, NOW, { territory: "futebol" });
    expect(lanes.happening).toEqual([]);
    expect(lanes.seasons.map((e) => e.id)).toEqual(["temporada"]);
    expect(lanes.next7.map((e) => e.id)).toEqual(["semana"]);
    expect(lanes.next30.map((e) => e.id)).toEqual(["mes"]);
  });

  it("acontecendo agora usa fim exclusivo", () => {
    expect(isHappening({ startsAt: day(-1), endsAt: NOW.toISOString() }, NOW)).toBe(false);
    expect(isHappening({ startsAt: NOW.toISOString(), endsAt: day(1) }, NOW)).toBe(true);
  });

  it("período (mês/trimestre) segue o fuso", () => {
    const newYearUtc = new Date("2027-01-01T01:00:00Z");
    expect(culturePeriod(newYearUtc, "America/Sao_Paulo")).toEqual({ year: 2026, month: 12, quarter: 4 });
    expect(culturePeriod(newYearUtc, "UTC")).toEqual({ year: 2027, month: 1, quarter: 1 });
  });

  it("lê hashtags do mês e trimestre com tolerância", () => {
    const meta = parseCultureMeta({
      month: { label: "#NOVEMBRO 2026", hashtags: ["#BlackFriday", 3, ""] },
      quarter: { quarter: "Q4", trending_topics: ["#Natal"], territories: ["Varejo"], summary: "Fim de ano" },
    });
    expect(meta.month).toEqual({ label: "#NOVEMBRO 2026", hashtags: ["#BlackFriday"] });
    expect(meta.quarter?.trendingTopics).toEqual(["#Natal"]);
    expect(parseCultureMeta(null)).toEqual({ month: null, quarter: null });
    expect(parseCultureMeta({ month: { hashtags: [] }, quarter: { trending_topics: [] } })).toEqual({ month: null, quarter: null });
  });

  it("oportunidades por evento: só números positivos", () => {
    const map = parseOpportunities([{ event_id: "a", sponsorships: 2, calls: 1 }, { event_id: "b", sponsorships: 0, calls: 0 }, { foo: 1 }]);
    expect([...map.keys()]).toEqual(["a"]);
    expect(map.get("a")).toEqual({ sponsorships: 2, calls: 1 });
    expect(parseOpportunities("x").size).toBe(0);
  });

  it("histórico comercial: linha ruim some; negócio só quando veio", () => {
    const items = parseCommercial({
      items: [
        { kind: "campaign", id: "c1", title: "Campanha", status: "submitted", starts_on: "2026-12-20", side: "agency", deal_id: "d1", deal_stage: "briefing" },
        { kind: "brand_call", id: "b1", title: "Chamada", status: "draft", side: "brand" },
        { kind: "deal", id: "x", side: "agency" },
        { kind: "sponsorship", id: "s1", side: "intruso" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["c1", "b1"]);
    expect(items[0].dealId).toBe("d1");
    expect(items[1].dealId).toBeNull();
    expect(parseCommercial(null)).toEqual([]);
  });

  it("hashtag sempre com um #", () => {
    expect(displayTag("##Copa")).toBe("#Copa");
    expect(displayTag("Copa")).toBe("#Copa");
  });
});

const BASE: PrefillEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Final da Copa",
  description: "A final mais esperada do ano.",
  location: "Maracanã",
  // dia inteiro em Brasília: 20 a 21/12 (fim exclusivo em 22/12 00:00 -03)
  startsAt: "2026-12-20T03:00:00Z",
  endsAt: "2026-12-22T03:00:00Z",
  allDay: true,
  timezone: "America/Sao_Paulo",
  territory: "futebol",
  hashtags: ["Copa", "Final"],
};

describe("Proposta a partir do evento: pré-preenchimento", () => {
  it("dias do evento no fuso dele (fim exclusivo)", () => {
    expect(eventDayRange(BASE)).toEqual({ first: "2026-12-20", last: "2026-12-21" });
    expect(eventDayRange({ startsAt: "2026-12-20T23:00:00Z", endsAt: "2026-12-21T01:00:00Z", timezone: "America/Sao_Paulo" })).toEqual({ first: "2026-12-20", last: "2026-12-20" });
  });

  it("período nunca começa no passado e respeita o teto de dias", () => {
    expect(proposalPeriod(BASE, "2026-12-21", 366)).toEqual({ start: "2026-12-21", end: "2026-12-21" });
    const season = { ...BASE, startsAt: "2026-04-01T03:00:00Z", endsAt: "2026-12-10T03:00:00Z" };
    expect(proposalPeriod(season, "2026-03-01", 62)).toEqual({ start: "2026-04-01", end: "2026-06-01" });
  });

  it("prazo de respostas: 3 dias antes; senão amanhã; senão o próprio dia", () => {
    expect(defaultRespondDate("2026-12-20", "2026-11-04")).toBe("2026-12-17");
    expect(defaultRespondDate("2026-11-06", "2026-11-04")).toBe("2026-11-05");
    expect(defaultRespondDate("2026-11-04", "2026-11-04")).toBe("2026-11-04");
  });

  it("campanha da marca: título, datas, briefing com hashtags, notas, segmento e vínculo", () => {
    const p = campaignPrefill(BASE, "2026-11-04");
    expect(p).toMatchObject({ title: "Final da Copa", periodStart: "2026-12-20", periodEnd: "2026-12-21", desiredTime: "", location: "Maracanã", notes: BASE.description, hashtagsText: "#Copa #Final", segmentSlugs: ["esportes"], calendarEventId: BASE.id });
    const timed = campaignPrefill({ ...BASE, allDay: false, startsAt: "2026-12-20T19:00:00Z", endsAt: "2026-12-20T22:00:00Z" }, "2026-11-04");
    expect(timed.desiredTime).toBe("16:00");
  });

  it("chamada da marca: nicho pelo território, hashtags na descrição", () => {
    const p = callPrefill(BASE, "2026-11-04", "Futebol");
    expect(p).toMatchObject({ startsOn: "2026-12-20", endsOn: "2026-12-21", nichesText: "Futebol", respondDate: "2026-12-17" });
    expect(p.description.endsWith("#Copa #Final")).toBe(true);
    expect(callPrefill({ ...BASE, territory: null }, "2026-11-04", null).nichesText).toBe("");
  });

  it("patrocínio da agência: evento com hora no mesmo dia mantém a hora; vários dias vira dia inteiro", () => {
    const timed = sponsorshipPrefill({ ...BASE, allDay: false, startsAt: "2026-12-20T19:00:00Z", endsAt: "2026-12-20T22:00:00Z" }, "2026-11-04");
    expect(timed).toMatchObject({ date: "2026-12-20", endDate: "", allDay: false, startTime: "16:00", endTime: "19:00" });
    const multi = sponsorshipPrefill(BASE, "2026-11-04");
    expect(multi).toMatchObject({ date: "2026-12-20", endDate: "2026-12-21", allDay: true });
  });

  it("título e descrição cabem nos limites (hashtags preservadas)", () => {
    const long = { ...BASE, title: "x".repeat(200), description: "y".repeat(3000) };
    expect(campaignPrefill(long, "2026-11-04").title).toHaveLength(120);
    const d = descriptionWithTags(long.description, long.hashtags);
    expect(d.length).toBeLessThanOrEqual(2000);
    expect(d.endsWith("#Copa #Final")).toBe(true);
    expect(descriptionWithTags("", [])).toBe("");
  });

  it("território → segmento só quando há correspondência entre os segmentos padrão", () => {
    expect(segmentSlugsFor("futebol")).toEqual(["esportes"]);
    expect(segmentSlugsFor("saude")).toEqual(["bem-estar"]);
    expect(segmentSlugsFor("musica")).toEqual([]);
    expect(segmentSlugsFor(null)).toEqual([]);
    expect(Object.keys(TERRITORY_SEGMENTS).sort()).toEqual([...TERRITORIES].sort());
    const defaults = ["fitness", "corrida", "esportes", "nutricao", "gastronomia", "bem-estar", "rotina", "lifestyle", "beleza", "familia"];
    for (const list of Object.values(TERRITORY_SEGMENTS)) for (const slug of list) expect(defaults).toContain(slug);
  });
});

describe("Conteúdos editoriais", () => {
  it("programado com data passada é publicado para quem lê", () => {
    expect(effectivePostStatus("scheduled", "2026-11-04T14:00:00Z", NOW)).toBe("published");
    expect(effectivePostStatus("scheduled", "2026-11-05T14:00:00Z", NOW)).toBe("scheduled");
    expect(effectivePostStatus("draft", null, NOW)).toBe("draft");
  });

  it("semana começa na segunda", () => {
    expect(weekStartOf("2026-11-04")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
    expect(weekDays("2026-11-02")).toHaveLength(7);
    expect(parseWeek("lixo", "2026-11-04")).toBe("2026-11-02");
    expect(parseWeek("2026-11-10", "2026-11-04")).toBe("2026-11-09");
  });

  it("planejamento agrupa por dia no fuso; rascunho fica sem data", () => {
    const posts = [
      { id: "a", status: "published" as const, publishedAt: "2026-11-05T02:00:00Z" }, // 04/11 23:00 em Brasília
      { id: "b", status: "scheduled" as const, publishedAt: "2026-11-05T13:00:00Z" },
      { id: "c", status: "draft" as const, publishedAt: null },
    ];
    const plan = planByDay(posts, "America/Sao_Paulo");
    expect(plan.byDay.get("2026-11-04")?.map((p) => p.id)).toEqual(["a"]);
    expect(plan.byDay.get("2026-11-05")?.map((p) => p.id)).toEqual(["b"]);
    expect(plan.undated.map((p) => p.id)).toEqual(["c"]);
  });

  it("links e imagem só https; título mínimo", () => {
    expect(isHttpsUrl("https://groscove.com/x")).toBe(true);
    expect(isHttpsUrl("http://groscove.com")).toBe(false);
    const ok = { id: null, kind: "news", title: "Notícia", body: "", imageUrl: "", linkUrl: "https://a.b/c", eventId: "", status: "draft", publishDate: "", publishTime: "" };
    expect(postSchema.safeParse(ok).success).toBe(true);
    expect(postSchema.safeParse({ ...ok, linkUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(postSchema.safeParse({ ...ok, title: "ab" }).success).toBe(false);
  });
});

describe("Compatibilidade e rotas", () => {
  it("só interesse ativo, heróis e marcas separados e em ordem", () => {
    const c = compatFromInterests([
      { party: "hero", ownerId: "h2", name: "Zeca", state: "interested" },
      { party: "hero", ownerId: "h1", name: "Ana", state: "interested" },
      { party: "hero", ownerId: "h3", name: "Bia", state: "withdrawn" },
      { party: "brand", ownerId: "b1", name: "Marca", state: "interested" },
    ]);
    expect(c.heroes.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(c.brands.map((b) => b.id)).toEqual(["b1"]);
  });

  it("links por lado: marca abre os dela; agência o negócio; herói só o negócio dele; admin só lê", () => {
    expect(commercialHref({ kind: "campaign", id: "r", side: "brand", dealId: null })).toBe("/marca/campanhas/r");
    expect(commercialHref({ kind: "campaign", id: "r", side: "agency", dealId: "d" })).toBe("/agencia/negocios/d");
    expect(commercialHref({ kind: "campaign", id: "r", side: "agency", dealId: null })).toBeNull();
    expect(commercialHref({ kind: "sponsorship", id: "s", side: "hero", dealId: null })).toBeNull();
    expect(commercialHref({ kind: "campaign", id: "r", side: "hero", dealId: "d" })).toBe("/heroi/oportunidades/d");
    expect(commercialHref({ kind: "brand_call", id: "c", side: "admin", dealId: null })).toBeNull();
    expect(eventHref("admin", "x")).toBe("/admin/agenda/x");
    expect(eventHref("hero", "x")).toBe("/heroi/agenda/groscove/x");
    expect(newSponsorshipHref("e", { talentId: "t" })).toBe("/agencia/oportunidades/nova?evento=e&heroi=t");
  });
});
