"use client";

// "Baixar PDF" de verdade: fotografa o conteúdo da página (<main>) no tema claro e monta um A4 com várias
// páginas. Substitui o window.print(), que no iPhone (Safari privado, app na tela inicial) muitas vezes não abre nada.
// No celular abre o menu de compartilhar ("Salvar em Arquivos"); no computador baixa o arquivo.
// Elementos com a classe print:hidden ou data-pdf-ignore ficam de fora, como na impressão.

const A4_W = 210;
const A4_H = 297;
const MARGIN = 10;

function shouldIgnore(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.dataset.pdfIgnore !== undefined) return true;
  return el.classList.contains("print:hidden");
}

function safeName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "documento"}.pdf`;
}

export async function downloadPagePdf(fileName: string, root?: HTMLElement | null): Promise<void> {
  const target = root ?? document.querySelector<HTMLElement>("main") ?? document.body;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const html = document.documentElement;
  const previousTheme = html.getAttribute("data-theme");
  html.setAttribute("data-theme", "light");
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(target, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      ignoreElements: shouldIgnore,
      windowWidth: Math.max(target.scrollWidth, 390),
    });
  } finally {
    if (previousTheme === null) html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", previousTheme);
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const contentW = A4_W - MARGIN * 2;
  const contentH = A4_H - MARGIN * 2;
  const pxPerMm = canvas.width / contentW;
  const pageHeightPx = Math.floor(contentH * pxPerMm);

  for (let y = 0, page = 0; y < canvas.height; y += pageHeightPx, page++) {
    const sliceH = Math.min(pageHeightPx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN, MARGIN, contentW, sliceH / pxPerMm);
  }

  const name = safeName(fileName);
  const blob = pdf.output("blob");
  const file = new File([blob], name, { type: "application/pdf" });
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (err) {
      // cancelado pelo usuário: não baixa de novo
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
