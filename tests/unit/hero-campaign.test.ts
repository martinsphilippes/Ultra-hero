import { describe, expect, it } from "vitest";
import {
  campaignCaption,
  campaignCreateHref,
  campaignReturnHref,
  campaignTags,
  canCreateForCampaign,
  deliverablesAwaitingLink,
  parseCampaignParam,
  parseContentBlock,
  parsePostMode,
  parsePublishedSlug,
  publishedContentUrl,
  toHeroCampaign,
  withCampaignTags,
} from "@/lib/hero-work/campaign";
import { EMPTY_BRIEF } from "@/lib/brief/brief";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";

describe("campanha do Hero: parâmetros", () => {
  it("aceita só uuid em ?campanha=", () => {
    expect(parseCampaignParam(ID)).toBe(ID);
    expect(parseCampaignParam(ID.toUpperCase())).toBe(ID);
    expect(parseCampaignParam([ID, "x"])).toBe(ID);
    expect(parseCampaignParam("abc")).toBeNull();
    expect(parseCampaignParam("")).toBeNull();
    expect(parseCampaignParam(undefined)).toBeNull();
  });
  it("aceita só slug em ?publicado=", () => {
    expect(parsePublishedSlug("meu-post-123")).toBe("meu-post-123");
    expect(parsePublishedSlug("../x")).toBeNull();
    expect(parsePublishedSlug("https://evil.example")).toBeNull();
    expect(parsePublishedSlug("-x")).toBeNull();
    expect(parsePublishedSlug(null)).toBeNull();
  });
  it("lê tipo e bloco", () => {
    expect(parsePostMode("video")).toBe("video");
    expect(parsePostMode("foto")).toBe("photo");
    expect(parsePostMode("x")).toBeNull();
    expect(parseContentBlock("treino")).toBe("workout");
    expect(parseContentBlock("programa")).toBe("program");
    expect(parseContentBlock(undefined)).toBeNull();
  });
});

describe("campanha do Hero: quem pode criar", () => {
  it("só confirmado em negócio que não terminou", () => {
    expect(canCreateForCampaign({ status: "contracted", dealStatus: "running" })).toBe(true);
    expect(canCreateForCampaign({ status: "proposed", dealStatus: "confirmed" })).toBe(true);
    expect(canCreateForCampaign({ status: "consulted", dealStatus: "open" })).toBe(false);
    expect(canCreateForCampaign({ status: "interested", dealStatus: "open" })).toBe(false);
    expect(canCreateForCampaign({ status: "contracted", dealStatus: "won" })).toBe(false);
    expect(canCreateForCampaign({ status: "contracted", dealStatus: "cancelled" })).toBe(false);
  });
});

describe("campanha do Hero: texto com as marcas do briefing", () => {
  it("põe @menções, #publi e hashtags, sem repetir", () => {
    expect(campaignTags({ mentions: ["@marca"], hashtags: ["#verao", "#Marca"] })).toEqual(["@marca", "#publi", "#verao", "#Marca"]);
    expect(campaignTags({ mentions: [], hashtags: ["#Publi", "#verao"] })).toEqual(["#Publi", "#verao"]);
    expect(campaignTags({ mentions: [], hashtags: ["#publicidade"] })).toEqual(["#publicidade"]);
    expect(campaignTags({ mentions: [], hashtags: [] })).toEqual(["#publi"]);
  });
  it("monta a legenda inicial", () => {
    expect(campaignCaption({ mentions: ["@loja"], hashtags: ["#verao"] }, 500)).toBe("@loja #publi #verao");
  });
  it("acrescenta só o que falta, numa linha própria", () => {
    expect(withCampaignTags("Treino de hoje #verao", ["@loja", "#publi", "#verao"], 500)).toBe("Treino de hoje #verao\n\n@loja #publi");
    expect(withCampaignTags("Tudo certo @Loja #PUBLI", ["@loja", "#publi"], 500)).toBe("Tudo certo @Loja #PUBLI");
  });
  it("não passa do limite e não corta marca no meio", () => {
    const out = withCampaignTags("", ["#publi", "#hashtagmuitolonga"], 12);
    expect(out).toBe("#publi");
    expect(withCampaignTags("abcdefghij", ["#publi"], 12)).toBe("abcdefghij");
  });
  it("lê o briefing da oportunidade", () => {
    const c = toHeroCampaign({ id: ID, deal: { id: "d", title: "Mulheres" }, brand: { name: "Marca" }, request: { brief: { ...EMPTY_BRIEF, hashtags: ["#a"], coupon: "X10" } } });
    expect(c).toMatchObject({ id: ID, dealId: "d", title: "Mulheres", brand: "Marca", hashtags: ["#a"], coupon: "X10", mentions: [] });
    expect(toHeroCampaign({ id: ID, deal: { id: "d", title: "T" }, brand: { name: "M" }, request: null }).hashtags).toEqual([]);
  });
});

describe("campanha do Hero: links", () => {
  it("cada atalho abre o criador com o contexto", () => {
    expect(campaignCreateHref("quick", ID)).toBe(`/heroi/post/novo?campanha=${ID}`);
    expect(campaignCreateHref("video", ID)).toBe(`/heroi/post/novo?campanha=${ID}&tipo=video`);
    expect(campaignCreateHref("photo", ID)).toBe(`/heroi/post/novo?campanha=${ID}&tipo=foto`);
    expect(campaignCreateHref("structured", ID)).toBe(`/heroi/conteudos/novo?campanha=${ID}`);
    expect(campaignCreateHref("workout", ID)).toBe(`/heroi/conteudos/novo?campanha=${ID}&bloco=treino`);
    expect(campaignCreateHref("program", ID)).toBe(`/heroi/conteudos/novo?campanha=${ID}&bloco=programa`);
    expect(campaignCreateHref("recipe", ID)).toBe(`/heroi/receitas/nova?campanha=${ID}`);
  });
  it("volta para a campanha com o slug e monta o link público", () => {
    expect(campaignReturnHref(ID, "meu-post")).toBe(`/heroi/oportunidades/${ID}?publicado=meu-post#entregas`);
    expect(campaignReturnHref(ID, null)).toBe(`/heroi/oportunidades/${ID}`);
    expect(publishedContentUrl("https://app.exemplo.com/", "meu-post")).toBe("https://app.exemplo.com/content/meu-post");
  });
  it("entregas que esperam link: enviar ou publicar", () => {
    const list = [
      { id: "1", status: "planned" as const },
      { id: "2", status: "submitted" as const },
      { id: "3", status: "approved" as const },
      { id: "4", status: "changes_requested" as const },
      { id: "5", status: "done" as const },
    ];
    expect(deliverablesAwaitingLink(list).map((d) => [d.id, d.action])).toEqual([
      ["1", "submit"],
      ["3", "publish"],
      ["4", "submit"],
    ]);
  });
});
