"use client";

import { termsImportKind } from "./terms-import";

// Extração do texto do documento NO NAVEGADOR (o arquivo não sai do aparelho para ser lido). As bibliotecas são
// carregadas sob demanda (import dinâmico) só quando alguém escolhe um arquivo, para não pesar a página dos termos.
//   • PDF: pdfjs-dist. O worker é o arquivo do próprio pacote, emitido pelo bundler (new URL + import.meta.url):
//     sem CDN externo.
//   • DOCX: mammoth (texto puro, sem formatação).
//   • TXT: UTF-8; se não for UTF-8 válido, tenta Windows-1252 (arquivos salvos no Bloco de Notas antigo).

export type ExtractErrorCode = "type" | "protected" | "no_text" | "read";

export class TermsExtractError extends Error {
  constructor(public code: ExtractErrorCode) {
    super(code);
  }
}

/** Páginas lidas do PDF (o campo tem 4.000 caracteres; mais do que isso não ajuda e demora no celular). */
const MAX_PDF_PAGES = 40;

async function extractPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    void task.destroy();
    if (error && typeof error === "object" && "name" in error && error.name === "PasswordException") throw new TermsExtractError("protected");
    throw new TermsExtractError("read");
  }
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        // o pdf.js já devolve os espaços entre palavras como itens; só a quebra de linha vem em hasEOL
        if (item.hasEOL) text += "\n";
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    void task.destroy();
  }
}

async function extractDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: data });
    return result.value;
  } catch {
    throw new TermsExtractError("read");
  }
}

function decodeTxt(data: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
}

/** Arquivo escolhido → texto bruto (a limpeza fica em terms-import.ts). */
export async function extractTermsText(file: File): Promise<string> {
  const kind = termsImportKind(file.name, file.type);
  if (!kind) throw new TermsExtractError("type");
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new TermsExtractError("read");
  }
  const text = kind === "pdf" ? await extractPdf(data) : kind === "docx" ? await extractDocx(data) : decodeTxt(data);
  // PDF escaneado (só imagem) não tem texto: sem OCR aqui
  if (text.replace(/\s+/g, "").length < 10) throw new TermsExtractError("no_text");
  return text;
}
