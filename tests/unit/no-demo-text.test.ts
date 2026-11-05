import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { badgeVariants } from "@/components/ui/badge";

// Decisão do responsável (11/2026): nada de "Demonstração/Demo" visível no sistema. Nomes de chave
// (ex.: commerce.demo.*) podem ficar; os textos exibidos não.
const LOCALES = ["pt-BR", "en", "es"] as const;
const DEMO_TEXT = /demonstra|demostra|\bdemo\b/i;

function texts(value: unknown, prefix: string, out: [string, string][]): [string, string][] {
  if (typeof value === "string") out.push([prefix, value]);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) texts(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function load(locale: string): Map<string, string> {
  const dir = path.join(process.cwd(), "messages", locale);
  const out: [string, string][] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) texts(JSON.parse(readFileSync(path.join(dir, file), "utf8")), file.slice(0, -5), out);
  return new Map(out);
}

describe("sem demonstração na interface", () => {
  for (const locale of LOCALES) {
    it(`${locale}: nenhum texto fala em demonstração/demo`, () => {
      const hits = [...load(locale)].filter(([, text]) => DEMO_TEXT.test(text)).map(([key, text]) => `${key}: ${text}`);
      expect(hits).toEqual([]);
    });
  }

  it("aviso de pagamento não ativado nos três idiomas", () => {
    expect(load("pt-BR").get("common.paymentsInactive")).toBe("Pagamento ainda não ativado: seu pedido é registrado sem cobrança.");
    expect(load("en").get("common.paymentsInactive")).toBe("Payments are not active yet: your order is recorded without any charge.");
    expect(load("es").get("common.paymentsInactive")).toBe("El pago aún no está activado: tu pedido se registra sin ningún cobro.");
    expect(load("pt-BR").get("commerce.checkout.statement")).toBe(load("pt-BR").get("common.paymentsInactive"));
  });

  it("selo de Hero fictício vira Perfil ilustrativo", () => {
    expect(load("pt-BR").get("catalog.fictional")).toBe("Perfil ilustrativo");
    expect(load("en").get("catalog.fictional")).toBe("Illustrative profile");
    expect(load("es").get("catalog.fictional")).toBe("Perfil ilustrativo");
  });

  it("o Badge não tem mais a variante tracejada de demonstração", () => {
    expect(Object.keys(badgeVariants)).not.toContain("demo");
  });
});
