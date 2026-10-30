import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Sobreposição de textos do app das lojas (messages-native/<locale>.json; docs/decisions/app-nas-lojas.md):
// só troca chaves que existem, com os mesmos placeholders e tags, e não volta a dizer "demonstração".

const LOCALES = ["pt-BR", "en", "es"] as const;
const ROOT = process.cwd();
type Flat = Map<string, string>;

function flatten(value: unknown, prefix: string, out: Flat): Flat {
  if (typeof value === "string") out.set(prefix, value);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function base(locale: string): Flat {
  const out: Flat = new Map();
  const dir = path.join(ROOT, "messages", locale);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) flatten(JSON.parse(readFileSync(path.join(dir, file), "utf8")), file.slice(0, -5), out);
  return out;
}

const overlay = (locale: string): Flat => flatten(JSON.parse(readFileSync(path.join(ROOT, "messages-native", `${locale}.json`), "utf8")), "", new Map());
const tokens = (text: string) => [...(text.match(/\{\s*[a-zA-Z0-9_]+\s*(?=[,}])|<\/?[a-z]+>/g) ?? [])].map((t) => t.replace(/\s/g, "")).sort().join(",");

const DEMO_WORDS = /fict[ií]ci|simulad|demonstra|\bdemo\b|de teste|de prueba|ilustrativ|\btest (shop|orders?|kit)\b/i;

// O que o app não mostra (rotas travadas ou superfícies ocultas) e os documentos legais, que valem
// para a web e o app e só mudam com revisão jurídica.
const NOT_IN_APP = [
  "legal.", "demo.", "commerce.", "seller.", "creator.", "editors.", "adminCommon.", "adminContent.", "adminOps.",
  "common.demo.", "catalog.", "me.plan.", "me.today.", "me.profile.plan.", "me.profile.links.plan.", "me.profile.links.orders.",
  "me.profile.demoNote", "me.account.demo.", "me.notifications.types.commerce_updates.", "consume.content.relatedProducts",
  "consume.content.lockNote", "consume.content.creatorFictional", "consume.player.demoBadge",
  "consume.certificate.disclaimer", "discover.explore.products.", "discover.personalities.profile.fictional",
  "discover.personalities.profile.products", "shopping.",
];

describe("messages-native", () => {
  for (const locale of LOCALES) {
    const b = base(locale);
    const o = overlay(locale);

    it(`${locale}: cada chave existe na base, com os mesmos placeholders e tags`, () => {
      for (const [key, text] of o) {
        expect(b.has(key), key).toBe(true);
        expect(tokens(text), key).toBe(tokens(b.get(key)!));
      }
    });

    it(`${locale}: a sobreposição não diz demonstração/simulado/fictício`, () => {
      for (const [key, text] of o) expect(DEMO_WORDS.test(text), `${key}: ${text}`).toBe(false);
    });
  }

  it("os três idiomas sobrepõem as mesmas chaves", () => {
    const keys = (l: string) => [...overlay(l).keys()].sort();
    expect(keys("en")).toEqual(keys("pt-BR"));
    expect(keys("es")).toEqual(keys("pt-BR"));
  });

  it("todo texto do app que fala de demonstração tem versão do app (pt-BR)", () => {
    const b = base("pt-BR");
    const o = overlay("pt-BR");
    const missing = [...b]
      .filter(([key, text]) => DEMO_WORDS.test(text) && !o.has(key) && !NOT_IN_APP.some((p) => key.startsWith(p)))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });
});
