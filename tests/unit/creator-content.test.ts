import { describe, expect, it } from "vitest";
import {
  canRemovePublished,
  contentEditorFields,
  contentKindsFor,
  creatorCanEdit,
  creatorContentHref,
  creatorKindHref,
  creatorLicenseKind,
  creatorPublishStep,
  heroCardCompact,
  heroSelectable,
  pickMyHero,
  showWorkOnHero,
} from "@/lib/creator-content/rules";

describe("campos do editor de conteúdo por público (0092)", () => {
  it("admin vê tudo; o creator não vê licença, conclusão, autor nem criar programa", () => {
    expect(contentEditorFields("admin")).toEqual({ authorPicker: true, license: true, completionMode: true, newProgramLink: true, programKind: true });
    expect(contentEditorFields("creator")).toEqual({ authorPicker: false, license: false, completionMode: false, newProgramLink: false, programKind: false });
  });
  it("tipos do seletor: o creator não tem Programa", () => {
    expect(contentKindsFor("admin")).toEqual(["structured", "post", "recipe", "program"]);
    expect(contentKindsFor("creator")).toEqual(["structured", "post", "recipe"]);
  });
});

describe("destino por tipo", () => {
  it("post vai ao composer, receita ao Portal do Chef, estruturado fica no editor", () => {
    expect(creatorKindHref("post")).toBe("/heroi/post/novo");
    expect(creatorKindHref("recipe")).toBe("/heroi/receitas/nova");
    expect(creatorKindHref("structured")).toBeNull();
    expect(creatorKindHref("program")).toBeNull();
  });
  it("Meus conteúdos: receita abre no Portal do Chef", () => {
    expect(creatorContentHref({ id: "a", type: "recipe" })).toBe("/heroi/receitas/a/editar");
    expect(creatorContentHref({ id: "a", type: "guide" })).toBe("/heroi/conteudos/a/editar");
  });
});

describe("licença e publicação do creator", () => {
  it("licença calculada: própria; embed de terceiros para YouTube/Vimeo", () => {
    expect(creatorLicenseKind("none")).toBe("own");
    expect(creatorLicenseKind("embed_youtube")).toBe("third_party_embed");
    expect(creatorLicenseKind("embed_vimeo")).toBe("third_party_embed");
  });
  it("próximo passo: publicar direto, enviar para revisão quando o tipo exige, em revisão, publicado, arquivado", () => {
    expect(creatorPublishStep({ status: "draft", reviewStatus: "none", reviewRequired: false })).toBe("publish");
    expect(creatorPublishStep({ status: "draft", reviewStatus: "returned", reviewRequired: true })).toBe("submit");
    expect(creatorPublishStep({ status: "draft", reviewStatus: "in_review", reviewRequired: true })).toBe("in_review");
    expect(creatorPublishStep({ status: "published", reviewStatus: "approved", reviewRequired: true })).toBe("published");
    expect(creatorPublishStep({ status: "archived", reviewStatus: "none", reviewRequired: false })).toBe("archived");
  });
  it("só titular e admin tiram do ar; membro não", () => {
    expect(canRemovePublished({ teamRole: "owner", isAdmin: false })).toBe(true);
    expect(canRemovePublished({ teamRole: "member", isAdmin: false })).toBe(false);
    expect(canRemovePublished({ teamRole: null, isAdmin: true })).toBe(true);
    expect(canRemovePublished({ teamRole: null, isAdmin: false })).toBe(false);
  });
  it("edita só rascunho fora de revisão e que não é receita", () => {
    expect(creatorCanEdit({ status: "draft", reviewStatus: "none", type: "guide" })).toBe(true);
    expect(creatorCanEdit({ status: "draft", reviewStatus: "in_review", type: "guide" })).toBe(false);
    expect(creatorCanEdit({ status: "published", reviewStatus: "approved", type: "guide" })).toBe(false);
    expect(creatorCanEdit({ status: "draft", reviewStatus: "none", type: "recipe" })).toBe(false);
  });
});

describe("Hero em uso de quem está em mais de uma equipe", () => {
  const heroes = [{ id: "a" }, { id: "b" }];
  it("usa o escolhido se ainda é da pessoa; senão o padrão", () => {
    expect(pickMyHero(heroes, "b", "a")).toBe("b");
    expect(pickMyHero(heroes, "x", "a")).toBe("a");
    expect(pickMyHero(heroes, null, "a")).toBe("a");
    expect(pickMyHero([], "b", null)).toBeNull();
  });
});

describe("cartão Você trabalha para", () => {
  it("só Hero ativo ou pendente é selecionável; suspenso não", () => {
    expect(heroSelectable("active")).toBe(true);
    expect(heroSelectable("pending")).toBe(true);
    expect(heroSelectable("suspended")).toBe(false);
  });
  it("compacto com um Hero só; lista com mais de um", () => {
    expect(heroCardCompact([{ id: "a" }])).toBe(true);
    expect(heroCardCompact([{ id: "a" }, { id: "b" }])).toBe(false);
  });
  it("Trabalhar neste Hero: só havendo mais de um, no selecionável que não está em uso", () => {
    const hs = [{ id: "a", status: "active" }, { id: "b", status: "pending" }, { id: "c", status: "suspended" }];
    expect(showWorkOnHero(hs, hs[0], "a")).toBe(false);
    expect(showWorkOnHero(hs, hs[1], "a")).toBe(true);
    expect(showWorkOnHero(hs, hs[2], "a")).toBe(false);
    expect(showWorkOnHero([hs[0]], hs[0], null)).toBe(false);
  });
  it("escolha vale só enquanto o Hero segue na lista de selecionáveis", () => {
    const selectable = [{ id: "a" }, { id: "b" }];
    expect(pickMyHero(selectable, "b", "a")).toBe("b");
    expect(pickMyHero(selectable, "c", "a")).toBe("a");
  });
});
