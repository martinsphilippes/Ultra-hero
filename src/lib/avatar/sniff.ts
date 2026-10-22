import type { AvatarMime } from "./constants";

// Tipo e dimensões da imagem lidos dos bytes (o servidor não confia no content-type nem no nome).
// Só WebP (VP8, VP8L, VP8X) e JPEG; qualquer outra coisa (PNG, HTML, arquivo truncado) é null.
// Sem dependências nativas: roda na função da Vercel e nos testes.

export type SniffResult = { mime: AvatarMime; width: number; height: number };

const ascii = (b: Uint8Array, at: number, text: string) => text.split("").every((c, i) => b[at + i] === c.charCodeAt(0));

function sniffWebp(b: Uint8Array): SniffResult | null {
  if (b.length < 30 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) return null;
  let width = 0;
  let height = 0;
  if (ascii(b, 12, "VP8 ")) {
    // quadro-chave: código de início 9d 01 2a e 14 bits de largura/altura
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    width = (b[26] | (b[27] << 8)) & 0x3fff;
    height = (b[28] | (b[29] << 8)) & 0x3fff;
  } else if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    width = 1 + (b[21] | ((b[22] & 0x3f) << 8));
    height = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10));
  } else if (ascii(b, 12, "VP8X")) {
    width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
  } else {
    return null;
  }
  return width > 0 && height > 0 ? { mime: "image/webp", width, height } : null;
}

// Marcadores SOF (início de quadro) com dimensões; C4 (DHT), C8 e CC (DAC) não são quadros.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function sniffJpeg(b: Uint8Array): SniffResult | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    // bytes de preenchimento 0xFF antes do marcador
    while (marker === 0xff && i + 2 < b.length) {
      i += 1;
      marker = b[i + 1];
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // fim da imagem ou início dos dados antes de achar o quadro: não é um JPEG utilizável
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (i + 8 >= b.length) return null;
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return width > 0 && height > 0 ? { mime: "image/jpeg", width, height } : null;
    }
    i += 2 + length;
  }
  return null;
}

export function sniffImage(bytes: Uint8Array): SniffResult | null {
  return sniffWebp(bytes) ?? sniffJpeg(bytes);
}
