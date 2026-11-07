import { describe, expect, it } from "vitest";
import { filterEntityOptions, searchKey } from "@/components/ui/entity-select";

const opts = [
  { value: "1", name: "João Silva", detail: "São Paulo" },
  { value: "2", name: "Joana Prado" },
  { value: "3", name: "Neymar Jr", disabled: true },
  { value: "4", name: "Ana Souza", org: "Groscove" },
];

describe("busca pelo nome na caixa de pessoas", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(searchKey("  JOÃO ")).toBe("joao");
    expect(filterEntityOptions(opts, "joao").map((o) => o.value)).toEqual(["1"]);
  });
  it("exige todas as palavras e procura também no detalhe e na empresa", () => {
    expect(filterEntityOptions(opts, "jo").map((o) => o.value)).toEqual(["1", "2"]);
    expect(filterEntityOptions(opts, "joao paulo").map((o) => o.value)).toEqual(["1"]);
    expect(filterEntityOptions(opts, "groscove").map((o) => o.value)).toEqual(["4"]);
  });
  it("não mostra opção desativada, nem nada com a busca vazia, e respeita o limite", () => {
    expect(filterEntityOptions(opts, "neymar")).toEqual([]);
    expect(filterEntityOptions(opts, "   ")).toEqual([]);
    expect(filterEntityOptions(opts, "a", 1)).toHaveLength(1);
  });
});
