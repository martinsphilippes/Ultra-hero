import { describe, expect, it } from "vitest";
import { kpiAriaLabel } from "@/components/admin-ops/KpiCard";

// Cartões clicáveis do início (04/11): o nome acessível do link junta rótulo, valor e dica quando tudo é texto.
describe("kpiAriaLabel", () => {
  it("junta rótulo e valor", () => {
    expect(kpiAriaLabel("Equipe", 3)).toBe("Equipe: 3");
  });
  it("acrescenta a dica", () => {
    expect(kpiAriaLabel("Tarefas", 5, "2 minhas · 1 atrasada")).toBe("Tarefas: 5 · 2 minhas · 1 atrasada");
  });
  it("valor zero continua no nome", () => {
    expect(kpiAriaLabel("Avisos não lidos", 0)).toBe("Avisos não lidos: 0");
  });
  it("sem texto puro, deixa o conteúdo do link nomear", () => {
    expect(kpiAriaLabel({ type: "span" } as never, 1)).toBeUndefined();
  });
});
