import { describe, expect, it } from "vitest";
import {
  briefDefined,
  briefPayload,
  briefValid,
  checkedKeys,
  checkItems,
  cleanCoupon,
  EMPTY_BRIEF,
  invalidEntries,
  itemFromKey,
  missingChecks,
  parseChecks,
  parseHashtags,
  parseLinks,
  parseMentions,
  toBrief,
  type Brief,
} from "@/lib/brief/brief";
import { clampTitle, templateNameValid } from "@/lib/brief/templates";

const brief: Brief = {
  hashtags: ["#publi", "#AlfaVerão"],
  mentions: ["@alfa.s87"],
  links: ["https://alfa.s87.test/promo"],
  coupon: "ALFA10",
  references: ["https://alfa.s87.test/ref"],
  donts: "Não falar de preço.",
  checks: ["Mostrar o rótulo"],
};

describe("briefing: entrada digitada", () => {
  it("hashtags ganham # e não repetem (sem diferenciar maiúsculas)", () => {
    expect(parseHashtags("publi, #Verao  #verao\n#AlfaVerão")).toEqual(["#publi", "#Verao", "#AlfaVerão"]);
  });
  it("menções ganham @ e recusam caracteres inválidos", () => {
    expect(parseMentions("marca @loja.oficial @a/b")).toEqual(["@marca", "@loja.oficial"]);
    expect(invalidEntries("marca @a/b", "mentions")).toEqual(["@a/b"]);
  });
  it("links só https", () => {
    expect(parseLinks("https://a.test/x http://b.test\nhttps://a.test/x")).toEqual(["https://a.test/x"]);
    expect(invalidEntries("https://a.test http://b.test", "links")).toEqual(["http://b.test"]);
  });
  it("itens extras: um por linha, 3 a 120 caracteres", () => {
    expect(parseChecks("Mostrar o rótulo\nok\n  mostrar   o rótulo \nFalar do FPS")).toEqual(["Mostrar o rótulo", "Falar do FPS"]);
  });
  it("cupom sem espaço e até 40", () => {
    expect(cleanCoupon(" ALFA 10 ")).toBe("ALFA10");
    expect(cleanCoupon("x".repeat(50))).toHaveLength(40);
  });
  it("limites de quantidade", () => {
    expect(parseHashtags(Array.from({ length: 20 }, (_, i) => `#t${i}`).join(" "))).toHaveLength(15);
  });
});

describe("briefing: validação igual ao banco", () => {
  it("aceita o briefing completo e o vazio", () => {
    expect(briefValid(brief)).toBe(true);
    expect(briefValid(EMPTY_BRIEF)).toBe(true);
  });
  it("recusa hashtag sem #, link http, repetido e cupom com espaço", () => {
    expect(briefValid({ ...brief, hashtags: ["publi"] })).toBe(false);
    expect(briefValid({ ...brief, links: ["http://x.test"] })).toBe(false);
    expect(briefValid({ ...brief, hashtags: ["#A", "#a"] })).toBe(false);
    expect(briefValid({ ...brief, coupon: "AB 10" })).toBe(false);
    expect(briefValid({ ...brief, checks: ["ok"] })).toBe(false);
  });
  it("toBrief ignora lixo; payload só leva o que tem conteúdo", () => {
    expect(toBrief(null)).toEqual(EMPTY_BRIEF);
    expect(toBrief({ hashtags: ["#a", 3], coupon: 5, outra: 1 })).toEqual({ ...EMPTY_BRIEF, hashtags: ["#a"] });
    expect(briefPayload({ ...EMPTY_BRIEF, coupon: " X ", hashtags: ["#a"] })).toEqual({ coupon: "X", hashtags: ["#a"] });
    expect(briefDefined(EMPTY_BRIEF)).toBe(false);
    expect(briefDefined({ ...EMPTY_BRIEF, donts: "Nada de preço" })).toBe(true);
  });
});

describe("checklists (mesma ordem de brief_check_items)", () => {
  it("marca: 5 padrão + extras", () => {
    expect(checkItems(brief, "brand").map((i) => i.key)).toEqual(["ad_label", "brand_mention", "link_coupon", "no_health_claims", "follows_brief", "extra:Mostrar o rótulo"]);
  });
  it("creator: 3 padrão + hashtags, @, links, cupom, não fazer, extras", () => {
    expect(checkItems(brief, "talent").map((i) => i.key)).toEqual([
      "ad_label",
      "brand_mention",
      "follows_brief",
      "hashtag:#publi",
      "hashtag:#AlfaVerão",
      "mention:@alfa.s87",
      "link:https://alfa.s87.test/promo",
      "coupon:ALFA10",
      "donts",
      "extra:Mostrar o rótulo",
    ]);
    expect(checkItems(EMPTY_BRIEF, "talent").map((i) => i.key)).toEqual(["ad_label", "brand_mention", "follows_brief"]);
  });
  it("faltando e marcados na ordem da lista", () => {
    const items = checkItems(brief, "brand");
    expect(missingChecks(items, ["ad_label", "brand_mention"]).map((i) => i.key)).toHaveLength(4);
    expect(checkedKeys(items, ["extra:Mostrar o rótulo", "ad_label", "lixo"])).toEqual(["ad_label", "extra:Mostrar o rótulo"]);
  });
  it("chave gravada → item", () => {
    expect(itemFromKey("no_health_claims")).toEqual({ key: "no_health_claims", kind: "standard", code: "no_health_claims" });
    expect(itemFromKey("coupon:ALFA10")).toEqual({ key: "coupon:ALFA10", kind: "coupon", value: "ALFA10" });
    expect(itemFromKey("link:https://a.test/x:y")).toEqual({ key: "link:https://a.test/x:y", kind: "link", value: "https://a.test/x:y" });
    expect(itemFromKey("estranho")).toEqual({ key: "estranho", kind: "extra", value: "estranho" });
  });
});

describe("modelos e duplicar", () => {
  it("nome do modelo: 3 a 80", () => {
    expect(templateNameValid("ab")).toBe(false);
    expect(templateNameValid("  Verão padrão ")).toBe(true);
    expect(templateNameValid("x".repeat(81))).toBe(false);
  });
  it("título da cópia cabe em 120", () => {
    expect(clampTitle("  Cópia de   Verão ")).toBe("Cópia de Verão");
    expect(clampTitle("x".repeat(130))).toHaveLength(120);
  });
});

describe("formulário do briefing", () => {
  it("ida e volta sem perder nada", async () => {
    const { briefToDraft, draftToBrief } = await import("@/lib/brief/brief");
    expect(draftToBrief(briefToDraft(brief))).toEqual(brief);
    expect(draftToBrief({ hashtags: "publi", mentions: "", links: "", coupon: " X 1", references: "http://x.test", donts: "  ", checks: "" })).toEqual({ ...EMPTY_BRIEF, hashtags: ["#publi"], coupon: "X1" });
  });
});

describe("erros novos", () => {
  it("checklist_incomplete e limit_reached viram códigos conhecidos", async () => {
    const { agencyErrorCode } = await import("@/lib/agency/error-codes");
    const { talentErrorCode } = await import("@/lib/talent/error-codes");
    expect(agencyErrorCode({ message: "checklist_incomplete" })).toBe("checklist_incomplete");
    expect(agencyErrorCode({ message: "limit_reached" })).toBe("limit_reached");
    expect(talentErrorCode({ message: "checklist_incomplete" })).toBe("checklist_incomplete");
    expect(talentErrorCode({ message: "limit_reached" })).toBe("generic");
  });
});
