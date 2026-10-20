import { describe, expect, it } from "vitest";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { groupCreatorProducts, maxCartQuantity, type CreatorProductLinkRow } from "@/lib/catalog/creator-products";

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
