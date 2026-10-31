// Gera os ícones do app (Tela de Início, PWA e favicon) a partir do símbolo da marca Groscove Ultra
// (o "A" em triângulo de src/components/layout/brand-paths.ts), no estilo "botão": fundo escuro com
// degradê, placa com borda laranja e brilho, e o triângulo centralizado com sombra.
// Uso: node scripts/generate-icons.mjs
// Saída: public/icons/groscove-v2-192.png, groscove-v2-512.png, groscove-v2-maskable-512.png,
//        src/app/apple-icon.png (180), src/app/icon.svg e src/app/favicon.ico (PNG 32/16 embutidos).
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const brand = readFileSync(new URL("../src/components/layout/brand-paths.ts", import.meta.url), "utf8");
const A_PATH = brand.match(/export const LOGO_A_PATH = "([^"]+)"/)[1];
// caixa justa do triângulo (medida no desenho), em coordenadas da logo
const MARK = { x: 965, y: 85, w: 388, h: 261.5 };

const S = 1024; // tudo é desenhado em 1024 e reduzido

function mark(cx, cy, width, id) {
  const scale = width / MARK.w;
  const h = MARK.h * scale;
  // triângulo: o peso visual fica embaixo; sobe 3% da altura para parecer centrado
  const x = cx - width / 2 - MARK.x * scale;
  const y = cy - h / 2 - h * 0.03 - MARK.y * scale;
  return `<g filter="url(#shadow-${id})"><path transform="translate(${x} ${y}) scale(${scale})" fill="url(#orange-${id})" d="${A_PATH}"/></g>`;
}

function defs(id, markWidth) {
  return `<defs>
  <radialGradient id="bg-${id}" cx="30%" cy="18%" r="95%">
    <stop offset="0" stop-color="#2A211C"/><stop offset="0.55" stop-color="#121212"/><stop offset="1" stop-color="#050505"/>
  </radialGradient>
  <linearGradient id="plate-${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1E1E20"/><stop offset="1" stop-color="#0A0A0A"/>
  </linearGradient>
  <linearGradient id="rim-${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFB27A"/><stop offset="0.35" stop-color="#FD4F05"/><stop offset="1" stop-color="#8F2E04"/>
  </linearGradient>
  <linearGradient id="gloss-${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="orange-${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FF8A3D"/><stop offset="0.5" stop-color="#FD4F05"/><stop offset="1" stop-color="#D63F02"/>
  </linearGradient>
  <filter id="glow-${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${S * 0.018}"/></filter>
  <filter id="shadow-${id}" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="${markWidth * 0.03}" stdDeviation="${markWidth * 0.035}" flood-color="#000" flood-opacity="0.7"/>
    <feDropShadow dx="0" dy="0" stdDeviation="${markWidth * 0.05}" flood-color="#FD4F05" flood-opacity="0.35"/>
  </filter>
</defs>`;
}

/** Ícone "botão": placa arredondada com borda laranja brilhante sobre o fundo escuro (cheio, sem cantos). */
function buttonIcon() {
  const inset = S * 0.085;
  const size = S - inset * 2;
  const r = size * 0.24;
  const rim = S * 0.022;
  const markW = S * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs("b", markW)}
<rect width="${S}" height="${S}" fill="url(#bg-b)"/>
<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${r}" fill="none" stroke="#FD4F05" stroke-width="${rim * 1.6}" opacity="0.55" filter="url(#glow-b)"/>
<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${r}" fill="url(#plate-b)"/>
<rect x="${inset + rim / 2}" y="${inset + rim / 2}" width="${size - rim}" height="${size - rim}" rx="${r - rim / 2}" fill="none" stroke="url(#rim-b)" stroke-width="${rim}"/>
<path d="M${inset + r} ${inset + rim}H${S - inset - r}A${r - rim} ${r - rim} 0 0 1 ${S - inset - rim} ${inset + r}V${S / 2 - S * 0.04}H${inset + rim}V${inset + r}A${r - rim} ${r - rim} 0 0 1 ${inset + r} ${inset + rim}Z" fill="url(#gloss-b)"/>
${mark(S / 2, S / 2, markW, "b")}
</svg>`;
}

/** Maskable (Android corta em círculo/gota): sem placa, só fundo e o símbolo na zona segura. */
function maskableIcon() {
  const markW = S * 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs("m", markW)}
<rect width="${S}" height="${S}" fill="url(#bg-m)"/>${mark(S / 2, S / 2, markW, "m")}</svg>`;
}

/** Favicon e aba do navegador: pequeno demais para a placa; fundo arredondado e o símbolo grande. */
function smallIcon() {
  const markW = S * 0.74;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs("s", markW)}
<rect width="${S}" height="${S}" rx="${S * 0.22}" fill="url(#bg-s)"/>${mark(S / 2, S / 2, markW, "s")}</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const button = buttonIcon();
const outputs = [
  ["public/icons/groscove-v2-192.png", button, 192],
  ["public/icons/groscove-v2-512.png", button, 512],
  ["public/icons/groscove-v2-maskable-512.png", maskableIcon(), 512],
  // Apple aplica a própria máscara: fundo cheio, sem cantos transparentes
  ["src/app/apple-icon.png", button, 180],
];
for (const [file, svg, size] of outputs) {
  const buf = await png(svg, size);
  writeFileSync(file, buf);
  console.log(`✓ ${file} (${buf.length} bytes)`);
}

writeFileSync("src/app/icon.svg", smallIcon());
console.log("✓ src/app/icon.svg");

// ICO contendo PNGs (suportado por todos os navegadores modernos)
const entries = [];
for (const size of [32, 16]) entries.push({ size, png: await png(smallIcon(), size) });
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = 6 + 16 * entries.length;
const dir = entries.map(({ size, png: data }) => {
  const e = Buffer.alloc(16);
  e[0] = size;
  e[1] = size;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]));
console.log("✓ src/app/favicon.ico");
