import { describe, expect, it } from "vitest";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { groupCreatorProducts, maxCartQuantity, mergeCreatorProducts, type CreatorProductContent, type CreatorProductDirectRow, type CreatorProductLinkRow } from "@/lib/catalog/creator-products";
import { officialStoreUrl, safeExternalUrl } from "@/lib/catalog/external-url";

type P = { id: string; title: string };
type Row = CreatorProductLinkRow<P>;

const content = (n: number, title: string) => ({ id: `c${n}`, slug: `conteudo-${n}`, title });
const product = (n: number, title = `Produto ${n}`): P => ({ id: `p${n}`, title });
const row = (id: string, c: Row["content"], p: Row["product"]): Row => ({ id, content: c, product: p });

describe("groupCreatorProducts", () => {
  it("devolve vazio sem linhas", () => {
    expect(groupCreatorProducts([])).toEqual([]);
    expect(groupCreatorProducts(null)).toEqual([]);
    expect(groupCreatorProducts(undefined)).toEqual([]);
  });

  it("deduplica por produto mantendo a ordem da primeira aparição", () => {
    const rows: Row[] = [
      row("l1", content(1, "Sopa"), product(2)),
      row("l2", content(2, "Bowl"), product(1)),
      row("l3", content(3, "Marmita"), product(2)),
      row("l4", content(1, "Sopa"), product(3)),
    ];
    const result = groupCreatorProducts(rows);
    expect(result.map((r) => r.product.id)).toEqual(["p2", "p1", "p3"]);
    expect(result[0].usedIn.map((c) => c.id)).toEqual(["c3", "c1"]);
    expect(result[1].usedIn.map((c) => c.id)).toEqual(["c2"]);
    expect(result[2].usedIn.map((c) => c.id)).toEqual(["c1"]);
  });

  it("ordena os conteúdos de cada produto por título (sem diferenciar acentos/maiúsculas) e não repete conteúdo", () => {
    const rows: Row[] = [
      row("l1", content(1, "Zumba em casa"), product(1)),
      row("l2", content(2, "árvore de hábitos"), product(1)),
      row("l3", content(3, "Bowl"), product(1)),
      row("l4", content(3, "Bowl"), product(1)),
    ];
    const [only] = groupCreatorProducts(rows);
    expect(only.usedIn.map((c) => c.title)).toEqual(["árvore de hábitos", "Bowl", "Zumba em casa"]);
    expect(only.usedIn).toHaveLength(3);
  });

  it("ignora linhas sem produto ou sem conteúdo (embed nulo ou array vazio)", () => {
    const rows: Row[] = [
      row("l1", content(1, "A"), null),
      row("l2", content(2, "B"), []),
      row("l3", null, product(9)),
      row("l4", [], product(9)),
      row("l5", content(3, "C"), product(5)),
    ];
    const result = groupCreatorProducts(rows);
    expect(result).toHaveLength(1);
    expect(result[0].product.id).toBe("p5");
    expect(result[0].usedIn).toEqual([{ id: "c3", slug: "conteudo-3", title: "C" }]);
  });

  it("aceita embeds em array (forma como o tipo gerado descreve a relação)", () => {
    const rows: Row[] = [row("l1", [content(1, "A")], [product(1, "Único")])];
    const result = groupCreatorProducts(rows);
    expect(result).toEqual([{ product: { id: "p1", title: "Único" }, usedIn: [{ id: "c1", slug: "conteudo-1", title: "A" }] }]);
  });

  it("guarda o objeto do produto da primeira linha e só o essencial do conteúdo", () => {
    const rows: Row[] = [row("l1", { ...content(1, "A"), extra: "x" } as unknown as Row["content"], product(1, "Primeiro")), row("l2", content(2, "B"), product(1, "Segundo"))];
    const [only] = groupCreatorProducts(rows);
    expect(only.product.title).toBe("Primeiro");
    expect(only.usedIn[0]).toEqual({ id: "c1", slug: "conteudo-1", title: "A" });
  });
});

describe("maxCartQuantity", () => {
  it("20 sem controle de estoque; estoque demo limita; nunca negativo", () => {
    expect(maxCartQuantity(null)).toBe(20);
    expect(maxCartQuantity(undefined)).toBe(20);
    expect(maxCartQuantity(50)).toBe(20);
    expect(maxCartQuantity(7)).toBe(7);
    expect(maxCartQuantity(0)).toBe(0);
    expect(maxCartQuantity(-3)).toBe(0);
  });
});

describe("isCommerceEnabled", () => {
  it("setting ausente ou ilegível = ligado", () => {
    expect(isCommerceEnabled(null)).toBe(true);
    expect(isCommerceEnabled(undefined)).toBe(true);
    expect(isCommerceEnabled({})).toBe(true);
    expect(isCommerceEnabled([])).toBe(true);
    expect(isCommerceEnabled({ "experiment.open": false })).toBe(true);
  });
  it("respeita o kill switch (booleano ou texto)", () => {
    expect(isCommerceEnabled({ "commerce.enabled": true })).toBe(true);
    expect(isCommerceEnabled({ "commerce.enabled": false })).toBe(false);
    expect(isCommerceEnabled({ "commerce.enabled": "false" })).toBe(false);
    expect(isCommerceEnabled({ "commerce.enabled": " FALSE " })).toBe(false);
    expect(isCommerceEnabled({ "commerce.enabled": "true" })).toBe(true);
    expect(isCommerceEnabled({ "commerce.enabled": null })).toBe(true);
  });
});

describe("mergeCreatorProducts", () => {
  type Direct = CreatorProductDirectRow<P>;
  const direct = (id: string, p: Direct["product"], sort: number, status = "validated"): Direct => ({ id, status, sort_order: sort, product: p });
  const linked = (p: P, ...contents: CreatorProductContent[]) => ({ product: p, usedIn: contents });

  it("devolve vazio sem nenhuma origem", () => {
    expect(mergeCreatorProducts([], [])).toEqual([]);
    expect(mergeCreatorProducts(null, undefined)).toEqual([]);
  });

  it("alocações diretas vêm primeiro, em ordem de sort_order, e os vinculados por conteúdo depois", () => {
    const rows: Direct[] = [direct("d1", product(3), 30), direct("d2", product(1), 10), direct("d3", product(2), 20)];
    const byContent = [linked(product(9), content(1, "Sopa")), linked(product(8), content(2, "Bowl"))];
    const result = mergeCreatorProducts(rows, byContent);
    expect(result.map((r) => r.product.id)).toEqual(["p1", "p2", "p3", "p9", "p8"]);
    expect(result[0].usedIn).toEqual([]);
    expect(result[3].usedIn).toEqual([{ id: "c1", slug: "conteudo-1", title: "Sopa" }]);
  });

  it("deduplica: produto alocado e também vinculado aparece uma vez, na posição da alocação, com o 'usado em'", () => {
    const rows: Direct[] = [direct("d1", product(1), 10), direct("d2", product(1, "repetido"), 5), direct("d3", product(2), 20)];
    const byContent = [linked(product(1, "do vínculo"), content(1, "Sopa")), linked(product(3), content(2, "Bowl"))];
    const result = mergeCreatorProducts(rows, byContent);
    expect(result.map((r) => r.product.id)).toEqual(["p1", "p2", "p3"]);
    // o objeto do produto vem da primeira alocação direta (menor sort_order); o usedIn vem do vínculo
    expect(result[0].product.title).toBe("repetido");
    expect(result[0].usedIn.map((c) => c.id)).toEqual(["c1"]);
    expect(result).toHaveLength(3);
  });

  it("ignora produto nulo/indisponível (RLS) e aceita embeds em array", () => {
    const rows: Direct[] = [direct("d1", null, 10), direct("d2", [], 20), direct("d3", [product(4)], 30), direct("d4", undefined, 40)];
    const result = mergeCreatorProducts(rows, []);
    expect(result).toEqual([{ product: { id: "p4", title: "Produto 4" }, usedIn: [] }]);
  });

  it("ignora status diferente de validated, se vier", () => {
    const rows: Direct[] = [direct("d1", product(1), 10, "suggested"), direct("d2", product(2), 20, "suspended"), direct("d3", product(3), 30, "rejected"), direct("d4", product(4), 40)];
    expect(mergeCreatorProducts(rows, []).map((r) => r.product.id)).toEqual(["p4"]);
  });

  it("sort_order repetido mantém a ordem de chegada", () => {
    const rows: Direct[] = [direct("d1", product(2), 10), direct("d2", product(1), 10), direct("d3", product(3), 10)];
    expect(mergeCreatorProducts(rows, []).map((r) => r.product.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("não altera as entradas", () => {
    const rows: Direct[] = [direct("d1", product(2), 20), direct("d2", product(1), 10)];
    const snapshot = JSON.stringify(rows);
    mergeCreatorProducts(rows, []);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe("safeExternalUrl / officialStoreUrl", () => {
  it("aceita só https absoluta e devolve a URL normalizada", () => {
    expect(safeExternalUrl("https://selvaje.lojavirtualnuvem.com.br/produtos/e-focus/")).toBe("https://selvaje.lojavirtualnuvem.com.br/produtos/e-focus/");
    expect(safeExternalUrl("  https://loja.exemplo.com  ")).toBe("https://loja.exemplo.com/");
    expect(safeExternalUrl("HTTPS://Loja.Exemplo.com/A?b=1#c")).toBe("https://loja.exemplo.com/A?b=1#c");
  });

  it("recusa http, javascript:, data:, caminhos relativos, credenciais e lixo", () => {
    const bad: unknown[] = ["http://loja.exemplo.com", "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,oi", "//loja.exemplo.com", "/produtos", "loja.exemplo.com", "https://", "https://user:pw@loja.exemplo.com", "", "   ", null, undefined, 42, {}, [], `https://a.b/${"x".repeat(2100)}`];
    for (const value of bad) expect(safeExternalUrl(value), String(value).slice(0, 40)).toBeNull();
  });

  it("lê attributes.external_url e ignora formatos inesperados", () => {
    expect(officialStoreUrl({ external_url: "https://loja.exemplo.com/p" })).toBe("https://loja.exemplo.com/p");
    expect(officialStoreUrl({ external_url: "javascript:void(0)" })).toBeNull();
    expect(officialStoreUrl({ brand: "x" })).toBeNull();
    expect(officialStoreUrl(null)).toBeNull();
    expect(officialStoreUrl("https://loja.exemplo.com")).toBeNull();
    expect(officialStoreUrl(["https://loja.exemplo.com"])).toBeNull();
  });
});
