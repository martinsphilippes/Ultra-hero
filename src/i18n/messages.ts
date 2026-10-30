import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AbstractIntlMessages } from "next-intl";
import { defaultLocale, type Locale } from "./config";

// Mensagens vivem em messages/<locale>/<namespace>.json.
// Cada arquivo vira um namespace (ex.: common.json -> "common"), então novos
// namespaces podem ser adicionados sem editar código compartilhado.
const MESSAGES_DIR = path.join(process.cwd(), "messages");

const cache = new Map<Locale, Promise<AbstractIntlMessages>>();

async function readLocaleDir(locale: Locale): Promise<AbstractIntlMessages> {
  const dir = path.join(MESSAGES_DIR, locale);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return {};
  }
  const messages: AbstractIntlMessages = {};
  for (const file of entries.filter((f) => f.endsWith(".json")).sort()) {
    const namespace = file.slice(0, -".json".length);
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    messages[namespace] = JSON.parse(raw) as AbstractIntlMessages;
  }
  return messages;
}

// Em produção o resultado é cacheado por processo; em dev relê a cada request.
export function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  if (process.env.NODE_ENV !== "production") return readLocaleDir(locale);
  let pending = cache.get(locale);
  if (!pending) {
    pending = readLocaleDir(locale);
    cache.set(locale, pending);
  }
  return pending;
}

// App das lojas: textos alternativos sem "demonstração", "simulado" ou "fictício"
// (messages-native/<locale>.json, sobrepostos às mesmas chaves; docs/decisions/app-nas-lojas.md).
const NATIVE_MESSAGES_DIR = path.join(process.cwd(), "messages-native");
const nativeCache = new Map<Locale, Promise<AbstractIntlMessages>>();

async function readNativeOverlay(locale: Locale): Promise<AbstractIntlMessages> {
  try {
    return JSON.parse(await fs.readFile(path.join(NATIVE_MESSAGES_DIR, `${locale}.json`), "utf8")) as AbstractIntlMessages;
  } catch {
    return {};
  }
}

function loadNativeOverlay(locale: Locale): Promise<AbstractIntlMessages> {
  if (process.env.NODE_ENV !== "production") return readNativeOverlay(locale);
  let pending = nativeCache.get(locale);
  if (!pending) {
    pending = readNativeOverlay(locale);
    nativeCache.set(locale, pending);
  }
  return pending;
}

/** Mensagens do request; no app das lojas, com a sobreposição de messages-native por cima. */
export async function loadRequestMessages(locale: Locale, nativeApp: boolean): Promise<AbstractIntlMessages> {
  const base = await loadMessagesWithFallback(locale);
  if (!nativeApp) return base;
  return deepMerge(base, await loadNativeOverlay(locale));
}

// Mescla o idioma padrão por baixo para que chaves faltantes não quebrem a UI.
export async function loadMessagesWithFallback(locale: Locale): Promise<AbstractIntlMessages> {
  const primary = await loadMessages(locale);
  if (locale === defaultLocale) return primary;
  const fallback = await loadMessages(defaultLocale);
  return deepMerge(fallback, primary);
}

function deepMerge(base: AbstractIntlMessages, override: AbstractIntlMessages): AbstractIntlMessages {
  const result: AbstractIntlMessages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (isRecord(existing) && isRecord(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isRecord(value: unknown): value is AbstractIntlMessages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
