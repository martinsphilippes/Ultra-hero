// Logo enviado da marca (0131): o tipo vem dos bytes, nunca do nome nem do content-type. SVG enviado não entra
// (pode carregar script); os SVGs oficiais importados ficam no próprio app, já limpos.

export const BRAND_LOGO_BUCKET = "brand-logos";
export const BRAND_LOGO_MAX_BYTES = 1024 * 1024;

export type LogoKind = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

export function sniffLogo(b: Uint8Array): LogoKind | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

/** Iniciais da marca para quando não há logo (até 2 letras). */
export function brandInitials(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s&.+-]+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
