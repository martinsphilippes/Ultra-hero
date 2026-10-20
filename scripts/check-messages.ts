// Verifica se messages/<locale>/*.json têm a MESMA árvore de chaves (e os mesmos placeholders {x}).
// Uso: npx tsx scripts/check-messages.ts   (ou: node scripts/check-messages.ts)
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "messages");
const REFERENCE = "pt-BR";

type Flat = Map<string, string>;

function flatten(value: unknown, prefix: string, out: Flat): Flat {
  if (typeof value === "string") {
    out.set(prefix, value);
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

function placeholders(message: string): string {
  // ignora ramos de plural/select ({=0 {texto}}): só conta {nome} seguido de "," ou "}"
  const found = message.match(/\{\s*([a-zA-Z0-9_]+)\s*(?=[,}])/g) ?? [];
  return found
    .map((m) => m.replace(/[{\s]/g, ""))
    .sort()
    .join(",");
}

function loadLocale(locale: string): Map<string, Flat> {
  const dir = path.join(ROOT, locale);
  const files = new Map<string, Flat>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const json = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as unknown;
    files.set(file, flatten(json, "", new Map()));
  }
  return files;
}

const locales = readdirSync(ROOT).filter((entry) => statSync(path.join(ROOT, entry)).isDirectory()).sort();
if (!locales.includes(REFERENCE)) {
  console.error(`Locale de referência "${REFERENCE}" não encontrado em ${ROOT}`);
  process.exit(1);
}

const problems: string[] = [];
const reference = loadLocale(REFERENCE);

for (const locale of locales) {
  const current = loadLocale(locale);

  for (const file of reference.keys()) {
    if (!current.has(file)) problems.push(`[${locale}] arquivo ausente: ${file}`);
  }
  for (const file of current.keys()) {
    if (!reference.has(file)) problems.push(`[${locale}] arquivo extra (não existe em ${REFERENCE}): ${file}`);
  }

  for (const [file, refKeys] of reference) {
    const keys = current.get(file);
    if (!keys) continue;
    for (const [key, refValue] of refKeys) {
      const value = keys.get(key);
      if (value === undefined) {
        problems.push(`[${locale}] ${file}: chave ausente "${key}"`);
        continue;
      }
      if (value.trim() === "") problems.push(`[${locale}] ${file}: valor vazio em "${key}"`);
      if (placeholders(value) !== placeholders(refValue)) {
        problems.push(`[${locale}] ${file}: placeholders diferentes em "${key}" ({${placeholders(value)}} vs {${placeholders(refValue)}})`);
      }
    }
    for (const key of keys.keys()) {
      if (!refKeys.has(key)) problems.push(`[${locale}] ${file}: chave extra "${key}" (não existe em ${REFERENCE})`);
    }
  }
}

const total = Array.from(reference.values()).reduce((sum, flat) => sum + flat.size, 0);
if (problems.length > 0) {
  console.error(`✗ ${problems.length} problema(s) encontrado(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`✓ Mensagens consistentes: ${locales.join(", ")} · ${reference.size} namespace(s) · ${total} chave(s) por locale`);
