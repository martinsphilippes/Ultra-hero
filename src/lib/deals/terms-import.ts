// Preenchimento rápido dos termos a partir de um documento (pedido do responsável, 05/11: "na hora de colocar os
// termos, tem que ser possível subir um doc"). Lógica pura (testada com vitest): limpeza do texto extraído, retirada
// de valores, corte no limite do campo e regras simples de palavras para pré-marcar os direitos de uso.
//
// Decisões:
//   • A extração (PDF/DOCX/TXT) acontece no navegador (terms-import-extract.ts); aqui só entra texto.
//   • Sem IA: regras de palavras, sem acento e sem diferenciar maiúsculas. Gancho para o futuro: `TermsDetector`
//     (um detector assíncrono com a mesma saída pode substituir ou complementar `detectTermsByRules`).
//   • "Condições" não leva valores (regra do campo): frases com R$ / "N reais" / BRL saem e a tela avisa.
//   • Negação simples: "sem exclusividade", "não inclui TV", "vedado o impulsionamento" não marcam nada (olha só o
//     trecho logo antes da palavra, até a vírgula/ponto anterior).
//   • Prazo: "N meses", "N anos" (×12), "N dias" (÷30, arredondado, mínimo 1), com número em algarismo ou por extenso
//     ("12 (doze) meses" também). O prazo de uso só vale em frase que fala de uso/veiculação/licença; o de
//     exclusividade, em frase que fala de exclusividade. Perpétuo: "perpétuo", "prazo/tempo indeterminado",
//     "prazo ilimitado".
//   • Pré-marcar só acrescenta: nunca desmarca o que a pessoa já marcou. Nada é salvo sozinho.

import { MAX_EXCLUSIVITY_MONTHS, MAX_USAGE_MONTHS, USAGE_CHANNELS, type Rights, type UsageChannel } from "@/lib/offer/rights";

export const TERMS_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
/** Limite do campo "Condições" (o mesmo maxLength do formulário). */
export const TERMS_SUMMARY_MAX = 4000;
export const TERMS_IMPORT_ACCEPT = [".pdf", ".docx", ".txt", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"].join(",");

export type TermsImportKind = "pdf" | "docx" | "txt";

/** Tipo pelo MIME ou, na falta (Android às vezes manda vazio), pela extensão. */
export function termsImportKind(name: string, mime: string): TermsImportKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx") return "docx";
  if (mime === "text/plain" || ext === "txt") return "txt";
  return null;
}

export type TermsImportFileIssue = "type" | "size" | "empty";

export function termsImportFileIssue(file: { name: string; type: string; size: number }): TermsImportFileIssue | null {
  if (!termsImportKind(file.name, file.type)) return "type";
  if (file.size < 1) return "empty";
  if (file.size > TERMS_IMPORT_MAX_BYTES) return "size";
  return null;
}

// ─── Limpeza ────────────────────────────────────────────────────────────────────────────────────────────────────

const PAGE_NOISE = /^(?:p[aá]g(?:ina)?\.?\s*\d+(?:\s*(?:de|\/)\s*\d+)?|\d+\s*(?:de|\/)\s*\d+|-?\s*\d{1,3}\s*-?)$/i;
const SENTENCE_END = /[.!?:;)"”»]$/;
const LIST_START = /^(?:[-•*▪●◦–—]|\d{1,2}[.)]|\d{1,2}(?:\.\d{1,2})+\.?|[a-z][.)]|(?:cl[aá]usula|art(?:igo)?\.?|par[aá]grafo|§)\s)/i;

/**
 * Texto extraído → texto limpo: une palavras hifenizadas na quebra ("contra-\nto"), junta linhas quebradas no meio
 * da frase, tira números de página, espaços repetidos e linhas vazias em excesso. Mantém parágrafos e listas.
 */
export function cleanExtractedText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[­​﻿]/g, "")
    .replace(/\f/g, "\n\n")
    .replace(/[\t   ]+/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim());
  const out: string[] = [];
  for (const line of lines) {
    if (PAGE_NOISE.test(line)) continue;
    const prev = out.length > 0 ? out[out.length - 1] : null;
    if (line === "") {
      if (prev !== null && prev !== "") out.push("");
      continue;
    }
    if (prev) {
      // palavra cortada com hífen no fim da linha ("contra-" + "to")
      if (/[a-zà-ÿ]-$/i.test(prev) && /^[a-zà-ÿ]/.test(line)) {
        out[out.length - 1] = prev.slice(0, -1) + line;
        continue;
      }
      // frase quebrada: a linha anterior não terminou e esta não começa item/cláusula
      if (!SENTENCE_END.test(prev) && !LIST_START.test(line) && !LIST_START.test(prev) && /^[a-zà-ÿ0-9(]/.test(line)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
      if (!SENTENCE_END.test(prev) && !LIST_START.test(line) && /^[a-zà-ÿ]/.test(line)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n").trim();
}

// ─── Valores ────────────────────────────────────────────────────────────────────────────────────────────────────

const MONEY = /R\$|\bBRL\s*\d|\bUS\$|\bUSD\s*\d|\d[\d.,]*\s*(?:mil\s+)?reais\b|\breais\s*\)|\bcach[eê]\s+de\s+\d/i;

/** Tira as frases com valores (R$, "N reais", BRL). Linha que só tinha valor some. */
export function stripMoney(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split("\n").map((line) => {
    if (!MONEY.test(line)) return line;
    const parts = line.split(/(?<=[.;!?])\s+/);
    const kept = parts.filter((p) => {
      if (!MONEY.test(p)) return true;
      removed += 1;
      return false;
    });
    return kept.length > 0 ? kept.join(" ") : null;
  });
  const out: string[] = [];
  for (const l of lines) {
    if (l === null) continue;
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return { text: out.join("\n"), removed };
}

/** Corta no limite (sem partir palavra quando dá) e termina com "…". */
export function fitToLimit(text: string, max: number = TERMS_SUMMARY_MAX): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  let cut = text.slice(0, max - 1);
  const space = cut.search(/\s\S*$/);
  // volta até o espaço anterior (palavra de até 40 letras)
  if (space > 0 && space >= cut.length - 40) cut = cut.slice(0, space);
  return { text: `${cut.trimEnd()}…`, truncated: true };
}

export type ConditionsResult = { text: string; moneyRemoved: number; truncated: boolean };

/** Texto do documento → texto para "Condições" (limpo, sem valores, no limite). */
export function prepareConditions(raw: string, max: number = TERMS_SUMMARY_MAX): ConditionsResult {
  const money = stripMoney(cleanExtractedText(raw));
  const fit = fitToLimit(money.text, max);
  return { text: fit.text, moneyRemoved: money.removed, truncated: fit.truncated };
}

/** Junta com o que já estava no campo: substituir ou acrescentar (com linha em branco), no limite. */
export function combineConditions(existing: string, incoming: string, mode: "replace" | "append", max: number = TERMS_SUMMARY_MAX): { text: string; truncated: boolean } {
  const base = mode === "append" && existing.trim() ? `${existing.trimEnd()}\n\n${incoming}` : incoming;
  return fitToLimit(base, max);
}

// ─── Regras de palavras ─────────────────────────────────────────────────────────────────────────────────────────

/** minúsculas e sem acento (as regras são escritas assim). Mantém o comprimento (índices batem com o original). */
export function normalizeForRules(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‐‑‒–—]/g, "-");
}

const NEGATION = /\b(?:nao|sem|nenhum|nenhuma|vedad[oa]s?|proibid[oa]s?|exceto|salvo|inexiste\w*|dispensad[oa]s?|nem)\b/;

/** Há ao menos uma ocorrência não negada (olha o trecho logo antes, até a pontuação anterior, 40 caracteres). */
function hasTerm(norm: string, re: RegExp): boolean {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of norm.matchAll(global)) {
    const before = norm.slice(Math.max(0, m.index - 40), m.index);
    const clause = before.split(/[.,;:\n()]/).pop() ?? "";
    if (!NEGATION.test(clause)) return true;
  }
  return false;
}

const CHANNEL_RULES: Record<Exclude<UsageChannel, "other">, RegExp> = {
  social: /\b(?:redes? sociais?|rede social|midias? sociais?|social media|instagram|insta|tik ?tok|youtube|facebook|kwai|reels|stories|twitter|linkedin|pinterest|threads|perfis? (?:da|de) marca)\b/,
  website: /\b(?:site|sites|website|landing ?pages?|blog|pagina institucional)\b/,
  paid_media: /\b(?:midias? pagas?|midia paga|paid media|impulsion\w*|trafego pago|anuncios? pagos?|ads|dark posts?|whitelisting|spark ads|meta ads|google ads)\b/,
  pos: /\b(?:pdv|pdvs|pontos? de venda|material de ponto|merchandising|displays?|lojas? fisicas?|vitrines?)\b/,
  email: /\b(?:newsletters?|e-?mail ?marketing|e-?mkt|emkt|(?:disparos?|campanhas?|base) de e-?mails?)\b|(?<!\b(?:por|via|pelo|para o|seu|o|endereco de|contato:?) )\be-?mails?\b(?!\s*[:@])/,
  ecommerce: /\b(?:e-?commerce|lojas? (?:online|virtua(?:l|is))|marketplaces?|paginas? de produtos?|site de vendas)\b/,
  ooh: /\b(?:midia exterior|ooh|outdoors?|out of home|busdoor|mobiliario urbano|paineis? de led|painel de led|empenas?|relogios? de rua)\b/,
  tv: /\b(?:tv|tvs|televis\w*|ctv|tv aberta|tv fechada|tv por assinatura)\b/,
};

const BOOST = /\b(?:impulsion\w*|boost\w*|dark posts?|whitelisting|spark ads|anuncios? de parceria|partnership ads)\b/;
const EXCLUSIVE = /\b(?:exclusividade|exclusiv[oa]s?)\b/;
const PERPETUAL = /\b(?:perpetu\w*|(?:prazo|tempo) indeterminado|(?:prazo|tempo) ilimitado|sem prazo de (?:termino|validade|expiracao))\b/;
const USAGE_CONTEXT = /\b(?:uso|usar|utiliza\w*|veicula\w*|licen\w*|cessao|cede|cedid[oa]s?|direitos? de imagem|direitos? autora\w*|autoriza\w*)\b/;

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11,
  doze: 12, quinze: 15, dezoito: 18, vinte: 20, "vinte e quatro": 24, trinta: 30, "trinta e seis": 36, quarenta: 40,
  "quarenta e cinco": 45, sessenta: 60, noventa: 90, "cento e vinte": 120, "cento e oitenta": 180, trezentos: 300,
  "trezentos e sessenta e cinco": 365,
};
const WORDS_ALT = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|");
const DURATION = new RegExp(`\\b(\\d{1,4}|${WORDS_ALT})\\s*(?:\\([^)]{1,40}\\)\\s*)?(dias?|mes|meses|anos?)\\b`, "g");

/** Primeiro prazo da frase, em meses (dias ÷ 30 arredondado, anos × 12). */
export function durationMonths(sentence: string): number | null {
  for (const m of normalizeForRules(sentence).matchAll(DURATION)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    if (!n) continue;
    const unit = m[2];
    if (unit.startsWith("dia")) return Math.max(1, Math.round(n / 30));
    if (unit.startsWith("ano")) return n * 12;
    return n;
  }
  return null;
}

export type TermsSuggestion = {
  channels: UsageChannel[];
  usageMonths: number | null;
  perpetual: boolean;
  boost: boolean;
  exclusive: boolean;
  exclusivityMonths: number | null;
  /** ids dos segmentos do casting citados no texto (só com exclusividade) */
  segmentIds: string[];
  /** categoria da exclusividade ("exclusividade na categoria de bebidas") */
  category: string;
};

/** Gancho para IA no futuro: mesma entrada e saída das regras (pode rodar depois delas e completar). */
export type TermsDetector = (text: string, segments: { id: string; name: string }[]) => Promise<TermsSuggestion>;

const sentencesOf = (text: string) => text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/** Regras simples de palavras (sem IA). */
export function detectTermsByRules(text: string, segments: { id: string; name: string }[] = []): TermsSuggestion {
  const norm = normalizeForRules(text);
  const channels = USAGE_CHANNELS.filter((c) => c !== "other" && hasTerm(norm, CHANNEL_RULES[c as Exclude<UsageChannel, "other">]));
  const boost = hasTerm(norm, BOOST);
  const exclusive = hasTerm(norm, EXCLUSIVE);
  let usageMonths: number | null = null;
  let exclusivityMonths: number | null = null;
  let perpetual = false;
  let category = "";
  for (const raw of sentencesOf(text)) {
    const sentence = raw.normalize("NFC");
    const s = normalizeForRules(sentence);
    if (EXCLUSIVE.test(s)) {
      if (!hasTerm(s, EXCLUSIVE)) continue;
      if (exclusivityMonths === null) exclusivityMonths = durationMonths(sentence);
      if (!category) {
        const m = /\b(?:segmento|categoria|setor|ramo)\s+(?:de\s+|do\s+|da\s+|dos\s+|das\s+)?([a-z0-9][a-z0-9 /&-]{1,58}?)(?=\s*(?:[.,;:()]|$|\bpor\b|\bdurante\b|\bpelo\b|\bpelos\b|\be\b|\bno\b|\bna\b))/.exec(s);
        // o texto normalizado tem o mesmo comprimento do original em NFC: devolve o trecho com acentos
        if (m) category = (s.length === sentence.length ? sentence : s).slice(m.index + m[0].length - m[1].length, m.index + m[0].length).trim();
      }
      continue;
    }
    if (!perpetual && hasTerm(s, PERPETUAL)) perpetual = true;
    if (usageMonths === null && USAGE_CONTEXT.test(s)) usageMonths = durationMonths(sentence);
  }
  if (perpetual) usageMonths = null;
  if (usageMonths !== null) usageMonths = Math.min(Math.max(usageMonths, 1), MAX_USAGE_MONTHS);
  if (exclusivityMonths !== null) exclusivityMonths = Math.min(Math.max(exclusivityMonths, 1), MAX_EXCLUSIVITY_MONTHS);
  const segmentIds = exclusive
    ? segments
        .filter((seg) => {
          const name = normalizeForRules(seg.name).trim();
          if (name.length < 3) return false;
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`).test(norm);
        })
        .map((seg) => seg.id)
    : [];
  return { channels, usageMonths, perpetual, boost, exclusive, exclusivityMonths: exclusive ? exclusivityMonths : null, segmentIds, category: exclusive ? category.slice(0, 120) : "" };
}

/** Algo foi encontrado (para o resumo). */
export function suggestionFound(s: TermsSuggestion): boolean {
  return s.channels.length > 0 || s.usageMonths !== null || s.perpetual || s.boost || s.exclusive;
}

/** Aplica a sugestão aos direitos do formulário: só acrescenta, não desmarca nada. */
export function applySuggestion(r: Rights, s: TermsSuggestion): Rights {
  const order = (c: UsageChannel) => USAGE_CHANNELS.indexOf(c);
  const next: Rights = { ...r, channels: Array.from(new Set([...r.channels, ...s.channels])).sort((a, b) => order(a) - order(b)) };
  if (s.perpetual) {
    next.perpetual = true;
    next.usageMonths = null;
  } else if (s.usageMonths !== null && !r.perpetual) {
    next.usageMonths = s.usageMonths;
  }
  if (s.boost) next.boost = true;
  if (s.exclusive) {
    next.exclusive = true;
    // sem prazo encontrado fica vazio de propósito: a validação pede que a pessoa preencha
    next.exclusivityMonths = s.exclusivityMonths ?? r.exclusivityMonths;
    next.segmentIds = Array.from(new Set([...r.segmentIds, ...s.segmentIds]));
    if (!r.category.trim() && s.category) next.category = s.category;
  }
  return next;
}
