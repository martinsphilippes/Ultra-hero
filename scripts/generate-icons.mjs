// Gera os ícones PWA (PNG) a partir da marca (losango laranja), sem dependências.
// Uso: node scripts/generate-icons.mjs
// Saída: public/icons/groscove-192.png, groscove-512.png, groscove-maskable-512.png,
//        src/app/apple-icon.png (180) e src/app/favicon.ico (PNG 32/16 embutidos).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = process.cwd();
const ICONS_DIR = path.join(ROOT, "public", "icons");
const APP_DIR = path.join(ROOT, "src", "app");

const OBSIDIAN = [11, 11, 11];
const ORANGE = [255, 90, 31];

// Mesma geometria do Logo.tsx (quadro 64x64): losango (quadrado a 45°).
const SHAPES = [{ color: ORANGE, points: [[32, 6], [58, 32], [32, 58], [6, 32]] }];

// ---------------------------------------------------------------- geometria --
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, size, radius) {
  const r = radius;
  const cx = x < r ? r : x > size - r ? size - r : x;
  const cy = y < r ? r : y > size - r ? size - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// ---------------------------------------------------------------- raster -----
// Renderiza com supersampling 4x4 para bordas suaves.
function render({ size, maskable = false, rounded = true, markScale = 0.7 }) {
  const ss = 4;
  const markSize = size * markScale;
  const offset = (size - markSize) / 2;
  const radius = size * 0.22;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const sx = x + (i + 0.5) / ss;
          const sy = y + (j + 0.5) / ss;
          const inBackground = maskable || !rounded ? true : inRoundedRect(sx, sy, size, radius);
          if (!inBackground) continue;
          let color = OBSIDIAN;
          const mx = ((sx - offset) / markSize) * 64;
          const my = ((sy - offset) / markSize) * 64;
          for (const shape of SHAPES) {
            if (pointInPolygon(mx, my, shape.points)) color = shape.color;
          }
          r += color[0];
          g += color[1];
          b += color[2];
          a += 255;
        }
      }
      const samples = ss * ss;
      const idx = (y * size + x) * 4;
      const coverage = a / samples / 255;
      // Cor pré-multiplicada desfeita: média só sobre amostras cobertas.
      const covered = a / 255 || 1;
      rgba[idx] = Math.round(r / covered);
      rgba[idx + 1] = Math.round(g / covered);
      rgba[idx + 2] = Math.round(b / covered);
      rgba[idx + 3] = Math.round(coverage * 255);
    }
  }
  return rgba;
}

// ---------------------------------------------------------------- PNG --------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtro "None"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ICO contendo PNGs (suportado por todos os navegadores modernos).
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = [];
  let offset = 6 + 16 * entries.length;
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    directory.push(entry);
  }
  return Buffer.concat([header, ...directory, ...entries.map((e) => e.png)]);
}

// ---------------------------------------------------------------- saída ------
mkdirSync(ICONS_DIR, { recursive: true });

const outputs = [
  { file: path.join(ICONS_DIR, "groscove-192.png"), size: 192, options: {} },
  { file: path.join(ICONS_DIR, "groscove-512.png"), size: 512, options: {} },
  // maskable: fundo cheio e marca dentro da zona segura (80% central)
  { file: path.join(ICONS_DIR, "groscove-maskable-512.png"), size: 512, options: { maskable: true, markScale: 0.56 } },
  // Apple aplica a própria máscara: fundo cheio, sem cantos transparentes
  { file: path.join(APP_DIR, "apple-icon.png"), size: 180, options: { rounded: false, markScale: 0.66 } },
];

for (const { file, size, options } of outputs) {
  const png = encodePng(size, render({ size, ...options }));
  writeFileSync(file, png);
  console.log(`✓ ${path.relative(ROOT, file)} (${png.length} bytes)`);
}

const favicon = encodeIco([
  { size: 32, png: encodePng(32, render({ size: 32, markScale: 0.8 })) },
  { size: 16, png: encodePng(16, render({ size: 16, markScale: 0.9 })) },
]);
writeFileSync(path.join(APP_DIR, "favicon.ico"), favicon);
console.log(`✓ src/app/favicon.ico (${favicon.length} bytes)`);
