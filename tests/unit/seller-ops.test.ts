import { describe, expect, it } from "vitest";
import { PORTAL_LINKS } from "@/components/layout/portal-nav";
import { DEMO_ACCESS_ACCOUNTS, DEMO_ACCOUNTS, demoAccount } from "@/lib/demo/accounts";
import {
  activeSellerHubTab,
  portalRolesShown,
  SELLER_HUB_TABS,
  SELLER_PORTAL_ENABLED,
  sellerHubHref,
  sellerPortalAccess,
  visibleDemoKinds,
} from "@/lib/seller-ops/portal";
import {
  ADMIN_FULFILLMENT_TRANSITIONS,
  adminTargetsFor,
  countByStatus,
  FULFILLMENT_STATUSES,
  isFulfillmentStatus,
  OPEN_FULFILLMENT_STATUSES,
  shortShipmentId,
  transitionNeedsJustification,
} from "@/lib/seller-ops/shipments";
import { productSlug, slugifyTitle } from "@/lib/seller-ops/slug";

const ORG = "11111111-2222-4333-8444-555555555555";

describe("portal do fornecedor desligado (a operação é do admin)", () => {
  it("a constante começa desligada", () => {
    expect(SELLER_PORTAL_ENABLED).toBe(false);
  });

  it("desligado: admin vai ao admin, os demais veem o aviso; ligado: segue o portal", () => {
    expect(sellerPortalAccess(true, false)).toBe("admin");
    expect(sellerPortalAccess(false, false)).toBe("closed");
    expect(sellerPortalAccess(false, true)).toBe("portal");
    expect(sellerPortalAccess(true, true)).toBe("portal");
  });

  it("painel de contas demo sem o fornecedor; a conta segue na lista completa", () => {
    expect(visibleDemoKinds(["admin", "seller", "free"], false)).toEqual(["admin", "free"]);
    expect(visibleDemoKinds(["admin", "seller"], true)).toEqual(["admin", "seller"]);
    expect(DEMO_ACCESS_ACCOUNTS.map((a) => a.kind)).toEqual(["admin", "creator", "premium", "free", "professional"]);
    expect(DEMO_ACCOUNTS.some((a) => a.kind === "seller")).toBe(true);
    expect(demoAccount("seller")).toBeNull();
    expect(demoAccount("admin")?.email).toBe("admin@demo.ultrahero.app");
  });

  it("Perfil não mostra atalho do portal do fornecedor", () => {
    expect(portalRolesShown(["seller", "admin"], false)).toEqual(["admin"]);
    expect(portalRolesShown(["seller", "admin"], true)).toEqual(["seller", "admin"]);
  });

  it("menu do admin tem Remessas (sem tirar nada: Fornecedores, Produtos e Pedidos continuam)", () => {
    const keys = PORTAL_LINKS.admin.map((l) => l.key);
    expect(keys).toContain("shipments");
    expect(keys).toEqual(expect.arrayContaining(["sellers", "products", "orders"]));
    expect(PORTAL_LINKS.admin.find((l) => l.key === "shipments")?.href).toBe("/admin/shipments");
  });
});

describe("abas da organização no admin", () => {
  it("quatro abas na ordem e com as rotas certas", () => {
    expect(SELLER_HUB_TABS).toEqual(["overview", "products", "shipments", "organization"]);
    expect(SELLER_HUB_TABS.map((tab) => sellerHubHref(ORG, tab))).toEqual([
      `/admin/sellers/${ORG}`,
      `/admin/sellers/${ORG}/products`,
      `/admin/sellers/${ORG}/shipments`,
      `/admin/sellers/${ORG}/organization`,
    ]);
  });

  it("subpáginas marcam a aba da lista; fronteira de segmento respeitada", () => {
    expect(activeSellerHubTab(`/admin/sellers/${ORG}`, ORG)).toBe("overview");
    expect(activeSellerHubTab(`/admin/sellers/${ORG}/products/new`, ORG)).toBe("products");
    expect(activeSellerHubTab(`/admin/sellers/${ORG}/products/abc/edit`, ORG)).toBe("products");
    expect(activeSellerHubTab(`/admin/sellers/${ORG}/shipments/xyz`, ORG)).toBe("shipments");
    expect(activeSellerHubTab(`/admin/sellers/${ORG}/organization`, ORG)).toBe("organization");
    expect(activeSellerHubTab(`/admin/sellers/${ORG}/productsx`, ORG)).toBe("overview");
    expect(activeSellerHubTab("/admin/products", ORG)).toBe("overview");
  });
});

describe("remessas", () => {
  it("admin herda as transições do fornecedor e as do sistema (espelha fulfillment_transition)", () => {
    expect(adminTargetsFor("awaiting")).toEqual(["preparing", "cancelled"]);
    expect(adminTargetsFor("preparing")).toEqual(["ready_for_dispatch", "cancelled"]);
    expect(adminTargetsFor("ready_for_dispatch")).toEqual(["in_transit", "cancelled"]);
    expect(adminTargetsFor("in_transit")).toEqual(["delivered", "failed"]);
    for (const s of ["delivered", "cancelled", "failed"]) expect(adminTargetsFor(s)).toEqual([]);
    expect(adminTargetsFor("qualquer")).toEqual([]);
    expect(Object.keys(ADMIN_FULFILLMENT_TRANSITIONS).sort()).toEqual([...FULFILLMENT_STATUSES].sort());
  });

  it("cancelar e falhar pedem justificativa; avançar não", () => {
    expect(transitionNeedsJustification("cancelled")).toBe(true);
    expect(transitionNeedsJustification("failed")).toBe(true);
    expect(transitionNeedsJustification("preparing")).toBe(false);
    expect(transitionNeedsJustification("delivered")).toBe(false);
  });

  it("status válidos, abertas e contagem só das chaves pedidas", () => {
    expect(isFulfillmentStatus("awaiting")).toBe(true);
    expect(isFulfillmentStatus("shipped")).toBe(false);
    expect(isFulfillmentStatus(null)).toBe(false);
    expect(OPEN_FULFILLMENT_STATUSES).toEqual(["awaiting", "preparing", "ready_for_dispatch"]);
    const rows = [{ status: "awaiting" }, { status: "awaiting" }, { status: "preparing" }, { status: "delivered" }];
    expect(countByStatus(rows, OPEN_FULFILLMENT_STATUSES)).toEqual({ awaiting: 2, preparing: 1, ready_for_dispatch: 0 });
    expect(countByStatus(null, ["draft"] as const)).toEqual({ draft: 0 });
  });

  it("id curto em maiúsculas com #", () => {
    expect(shortShipmentId("abcdef12-3456-4789-8abc-def012345678")).toBe("#ABCDEF12");
  });
});

describe("slug do produto criado pelo admin", () => {
  it("sem acentos, minúsculo, hífens e sufixo de 4 caracteres", () => {
    expect(slugifyTitle("  Pão de Queijo — Mineiro! ")).toBe("pao-de-queijo-mineiro");
    expect(productSlug("Pão de Queijo", () => 0.123456)).toMatch(/^pao-de-queijo-[a-z0-9]{4}$/);
    expect(productSlug("!!!", () => 0.5)).toMatch(/^produto-[a-z0-9]{4}$/);
    expect(slugifyTitle("x".repeat(120))).toHaveLength(80);
  });
});
