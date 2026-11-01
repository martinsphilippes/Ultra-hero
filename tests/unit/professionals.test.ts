import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_LINKS, PORTAL_ROOT } from "@/components/layout/portal-nav";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import {
  canTransition,
  cartTotals,
  durationParts,
  hireAction,
  isProfessionalSlug,
  minNoteLength,
  nextStatuses,
  ORDER_STATUSES,
  parsePriceInput,
  parseProfessionalTap,
  pickSuggested,
  responseStats,
  validServiceShape,
  type OrderActor,
  type OrderStatus,
} from "@/lib/professionals/rules";

// Profissionais e serviços (Etapa 3, 0058): regras puras.

describe("situação do pedido", () => {
  it("profissional: aceita/recusa o novo, agenda, remarca, conclui e cancela o aceito", () => {
    expect(nextStatuses("professional", "pending")).toEqual(["accepted", "declined"]);
    expect(nextStatuses("professional", "accepted")).toEqual(["scheduled", "completed", "cancelled"]);
    expect(nextStatuses("professional", "scheduled")).toEqual(["scheduled", "completed", "cancelled"]);
    for (const closed of ["completed", "declined", "cancelled"] as OrderStatus[]) expect(nextStatuses("professional", closed)).toEqual([]);
  });

  it("cliente só cancela enquanto ninguém respondeu; admin cancela qualquer aberto", () => {
    expect(nextStatuses("consumer", "pending")).toEqual(["cancelled"]);
    expect(canTransition("consumer", "accepted", "cancelled")).toBe(false);
    expect(canTransition("consumer", "pending", "accepted")).toBe(false);
    for (const open of ["pending", "accepted", "scheduled"] as OrderStatus[]) expect(nextStatuses("admin", open)).toEqual(["cancelled"]);
    expect(canTransition("admin", "pending", "accepted")).toBe(false);
    expect(canTransition("admin", "completed", "cancelled")).toBe(false);
  });

  it("encerrado não volta atrás para ninguém", () => {
    const actors: OrderActor[] = ["professional", "consumer", "admin"];
    for (const actor of actors)
      for (const from of ["completed", "declined", "cancelled"] as OrderStatus[])
        for (const to of ORDER_STATUSES) expect(canTransition(actor, from, to)).toBe(false);
  });

  it("recado obrigatório: agendar (3+) e recusar/cancelar pelo profissional ou admin (5+)", () => {
    expect(minNoteLength("professional", "scheduled")).toBe(3);
    expect(minNoteLength("professional", "declined")).toBe(5);
    expect(minNoteLength("admin", "cancelled")).toBe(5);
    expect(minNoteLength("consumer", "cancelled")).toBe(0);
    expect(minNoteLength("professional", "accepted")).toBe(0);
  });

  it("a tabela do código é a mesma de service_order_can (0058)", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0058_professionals.sql"), "utf8");
    const body = sql.slice(sql.indexOf("function public.service_order_can"), sql.indexOf("revoke execute on function public.service_order_can"));
    const pairs = [...body.matchAll(/\('([a-z]+)', '([a-z]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const fromCode = ORDER_STATUSES.flatMap((from) => ORDER_STATUSES.filter((to) => canTransition("professional", from, to)).map((to) => `${from}>${to}`));
    // profissional (lista do SQL) + cliente ('pending','cancelled')
    expect(pairs).toEqual([...fromCode, "pending>cancelled"].sort());
  });
});

describe("preço e carrinho", () => {
  it("serviços somam sem frete; com produto, o total espera o destino", () => {
    expect(cartTotals({ productSubtotalCents: 0, shippingCents: null, hasProducts: false, services: [{ priceCents: 18000 }, { priceCents: 9000 }] })).toEqual({
      servicesCents: 27000,
      shippingCents: 0,
      totalCents: 27000,
    });
    expect(cartTotals({ productSubtotalCents: 5000, shippingCents: null, hasProducts: true, services: [{ priceCents: 18000 }] }).totalCents).toBeNull();
    expect(cartTotals({ productSubtotalCents: 5000, shippingCents: 1000, hasProducts: true, services: [{ priceCents: 18000 }] }).totalCents).toBe(24000);
  });

  it("preço digitado: real com vírgula ou ponto, limites de R$ 5 a R$ 100 mil", () => {
    expect(parsePriceInput("180")).toBe(18000);
    expect(parsePriceInput("180,50")).toBe(18050);
    expect(parsePriceInput("R$ 1.234,00")).toBe(123400);
    expect(parsePriceInput("99.9")).toBe(9990);
    expect(parsePriceInput("4,99")).toBeNull();
    expect(parsePriceInput("100000,01")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-10")).toBeNull();
  });

  it("formato do serviço: sessão com minutos, plano com semanas", () => {
    expect(validServiceShape({ kind: "session", mode: "online", durationMinutes: 60, planWeeks: null })).toBe(true);
    expect(validServiceShape({ kind: "session", mode: "online", durationMinutes: 10, planWeeks: null })).toBe(false);
    expect(validServiceShape({ kind: "session", mode: "online", durationMinutes: null, planWeeks: null })).toBe(false);
    expect(validServiceShape({ kind: "plan", mode: "both", durationMinutes: null, planWeeks: 4 })).toBe(true);
    expect(validServiceShape({ kind: "plan", mode: "in_person", durationMinutes: null, planWeeks: 60 })).toBe(false);
  });
});

describe("tempo de resposta", () => {
  it("mediana e média só dos respondidos; aguardando conta à parte", () => {
    const t0 = Date.parse("2026-10-30T10:00:00Z");
    const at = (min: number) => new Date(t0 + min * 60000).toISOString();
    const stats = responseStats(
      [
        { createdAt: at(0), firstResponseAt: at(10) },
        { createdAt: at(0), firstResponseAt: at(30) },
        { createdAt: at(0), firstResponseAt: at(120) },
        { createdAt: at(0), firstResponseAt: null },
      ],
      t0 + 300 * 60000,
    );
    expect(stats).toMatchObject({ answered: 3, waiting: 1, medianMinutes: 30, oldestWaitingMinutes: 300 });
    expect(stats.averageMinutes).toBeCloseTo(53.33, 1);
    expect(responseStats([]).medianMinutes).toBeNull();
    expect(durationParts(12)).toEqual({ unit: "min", value: 12 });
    expect(durationParts(150)).toEqual({ unit: "h", value: 3 });
    expect(durationParts(60 * 72)).toEqual({ unit: "d", value: 3 });
  });
});

describe("quem vê Contratar", () => {
  const base = { nativeApp: false, commerceEnabled: true, loggedIn: true, ownService: false };
  it("logado contrata; visitante entra; o próprio profissional não", () => {
    expect(hireAction(base)).toBe("hire");
    expect(hireAction({ ...base, loggedIn: false })).toBe("login");
    expect(hireAction({ ...base, ownService: true })).toBe("own");
  });
  it("app das lojas e comércio desligado: nada", () => {
    expect(hireAction({ ...base, nativeApp: true })).toBe("none");
    expect(hireAction({ ...base, nativeApp: true, loggedIn: false })).toBe("none");
    expect(hireAction({ ...base, commerceEnabled: false })).toBe("none");
  });
  it("app das lojas: o portal e a contratação ficam fora; a lista e o perfil continuam", () => {
    expect(isBlockedInNativeApp("/profissional")).toBe(true);
    expect(isBlockedInNativeApp("/profissional/pedidos/abc")).toBe(true);
    expect(isBlockedInNativeApp("/profissionais")).toBe(false);
    expect(isBlockedInNativeApp("/profissionais/nina-horta")).toBe(false);
  });
});

describe("sugeridos e contador", () => {
  it("receita, depois herói, depois qualquer um; sem repetir", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    expect(pickSuggested({ recipe: [a], hero: [a, b], any: [c, b] }, 3)).toEqual({ items: [a, b, c], source: "recipe" });
    expect(pickSuggested({ recipe: [], hero: [b], any: [b, c] }, 1)).toEqual({ items: [b], source: "hero" });
    expect(pickSuggested({ recipe: [], hero: [], any: [c] })).toEqual({ items: [c], source: "any" });
    expect(pickSuggested({ recipe: [], hero: [], any: [] })).toEqual({ items: [], source: null });
  });

  it("toque: só o formato esperado, sem dado da pessoa", () => {
    const id = "D0000000-0000-4000-8000-000000000001";
    expect(parseProfessionalTap({ professionalId: id, creatorId: null, source: "receita", action: "contratar" })).toEqual({
      professionalId: id.toLowerCase(),
      creatorId: null,
      source: "receita",
      action: "contratar",
    });
    expect(parseProfessionalTap({ professionalId: id, source: "perfil", action: "ver_perfil" })?.creatorId).toBeNull();
    expect(parseProfessionalTap({ professionalId: "x", source: "receita", action: "contratar" })).toBeNull();
    expect(parseProfessionalTap({ professionalId: id, source: "email", action: "contratar" })).toBeNull();
    expect(parseProfessionalTap({ professionalId: id, source: "receita", action: "comprar" })).toBeNull();
    expect(parseProfessionalTap({ professionalId: id, creatorId: "nope", source: "receita", action: "contratar" })).toBeNull();
    expect(parseProfessionalTap(null)).toBeNull();
  });

  it("endereço do perfil", () => {
    expect(isProfessionalSlug("nina-horta")).toBe(true);
    expect(isProfessionalSlug("Nina")).toBe(false);
    expect(isProfessionalSlug("..%2Fadmin")).toBe(false);
    expect(isProfessionalSlug("ab")).toBe(false);
  });
});

describe("portal e conta de acesso rápido", () => {
  it("portal do profissional em /profissional com Painel, Pedidos, Serviços e Perfil; admin ganha Profissionais", () => {
    expect(PORTAL_ROOT.professional).toBe("/profissional");
    expect(PORTAL_LINKS.professional.map((l) => l.href)).toEqual(["/profissional", "/profissional/pedidos", "/profissional/servicos", "/profissional/perfil"]);
    expect(PORTAL_LINKS.admin.find((l) => l.key === "professionals")?.href).toBe("/admin/professionals");
  });
});
