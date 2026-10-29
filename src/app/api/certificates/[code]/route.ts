import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { formatDate } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// GET /api/certificates/[code] → PDF (A4 paisagem) do certificado SIMBÓLICO.
// Sob RLS: só o dono (ou admin) encontra o certificado; os demais recebem 404.

export const dynamic = "force-dynamic";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const ACCENT = rgb(1, 0.353, 0.122); // #ff5a1f
const OBSIDIAN = rgb(0.043, 0.043, 0.043); // #0b0b0b
const PAPER = rgb(0.969, 0.957, 0.937); // #f7f4ef
const MUTED = rgb(0.4, 0.38, 0.36);

type Snapshot = { display_name?: string; program_title?: string; version?: number | string; completed_at?: string; symbolic?: boolean };

// Fontes padrão do PDF só codificam WinAnsi: remove o que não dá para desenhar.
function safeText(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function centered(page: PDFPage, font: PDFFont, text: string, size: number, y: number, color = OBSIDIAN) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

// Marca em degraus (eco do logotipo), desenhada com retângulos.
function drawStepMark(page: PDFPage, x: number, y: number, unit: number) {
  page.drawRectangle({ x, y, width: unit * 3, height: unit, color: ACCENT });
  page.drawRectangle({ x: x + unit, y: y + unit, width: unit * 2, height: unit, color: ACCENT, opacity: 0.8 });
  page.drawRectangle({ x: x + unit * 2, y: y + unit * 2, width: unit, height: unit, color: ACCENT, opacity: 0.6 });
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  await requireUser(`/api/certificates/${encodeURIComponent(code)}`);
  if (!/^UH-[A-Z0-9]{6,16}$/.test(code)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: cert } = await supabase.from("certificates").select("code, issued_at, revoked_at, snapshot").eq("code", code).maybeSingle();
  if (!cert) return new NextResponse("Not found", { status: 404 });

  const [t, locale] = await Promise.all([getTranslations("consume.certificate"), getLocale()]);
  const snapshot = (cert.snapshot ?? {}) as Snapshot;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const verifyUrl = `${siteUrl}/verify/${cert.code}`;
  const completedAt = snapshot.completed_at ? formatDate(snapshot.completed_at, locale) : formatDate(cert.issued_at, locale);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${t("title")} - ${cert.code}`);
  pdf.setAuthor("Groscove Ultra (demo)");
  pdf.setSubject(t("disclaimer"));
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage(A4_LANDSCAPE);
  const { width, height } = page.getSize();
  const s = (text: string) => safeText(regular, text);

  // Fundo, moldura e faixas da marca
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({ x: 0, y: 0, width: 18, height, color: OBSIDIAN });
  page.drawRectangle({ x: 18, y: 0, width: 6, height, color: ACCENT });
  page.drawRectangle({ x: 48, y: 40, width: width - 96, height: height - 80, borderColor: OBSIDIAN, borderWidth: 1.2, opacity: 0 });
  drawStepMark(page, width - 120, height - 110, 14);

  centered(page, bold, s("GROSCOVE ULTRA"), 14, height - 78, OBSIDIAN);
  centered(page, regular, s(t("subtitle")), 10, height - 94, MUTED);
  centered(page, bold, s(t("title")), 30, height - 150, OBSIDIAN);

  centered(page, regular, s(t("awardedTo")), 12, height - 205, MUTED);
  centered(page, bold, s(snapshot.display_name || t("participant")), 28, height - 240, ACCENT);
  centered(page, regular, s(t("forCompleting")), 12, height - 280, MUTED);
  const programTitle = s(snapshot.program_title ?? "");
  const titleLines = wrap(bold, programTitle, 22, width - 200);
  let y = height - 312;
  for (const line of titleLines) {
    centered(page, bold, line, 22, y, OBSIDIAN);
    y -= 28;
  }
  centered(page, regular, s(`${t("version", { n: String(snapshot.version ?? "") })}  ·  ${t("completedOn", { date: completedAt })}`), 12, y - 4, MUTED);

  // Código, verificação e aviso de que é simbólico
  centered(page, bold, s(t("code", { code: cert.code })), 12, 118, OBSIDIAN);
  centered(page, regular, s(t("verify", { url: verifyUrl })), 10, 102, MUTED);
  const disclaimerLines = wrap(regular, s(t("disclaimer")), 9, width - 220);
  let dy = 80;
  for (const line of disclaimerLines) {
    centered(page, regular, line, 9, dy, MUTED);
    dy -= 12;
  }

  if (cert.revoked_at) {
    const label = s(t("revoked"));
    const size = 64;
    const w = bold.widthOfTextAtSize(label, size);
    page.drawText(label, { x: (width - w) / 2, y: height / 2 - 20, size, font: bold, color: rgb(0.8, 0.1, 0.1), opacity: 0.35, rotate: { type: "degrees", angle: 18 } as never });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificado-${cert.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
