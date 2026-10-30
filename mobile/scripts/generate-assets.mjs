// Ícones, splash e ficha da loja a partir da marca oficial Groscove Ultra (docs/brand/*.svg; o mesmo
// símbolo dos ícones da web em public/icons). Trocou a marca? Atualize os SVGs e rode
//   node mobile/scripts/generate-assets.mjs
// Lições do Quantso (docs/operations/publicacao-nas-lojas.md lá): ícone da Apple sem alfa; adaptive
// icon com a marca dentro da zona segura (66%) e fundo transparente, a cor vem de backgroundColor;
// ícone de notificação só com a forma, branca sobre transparente (sem alfa vira quadrado branco).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "assets");
const BRAND = path.join(HERE, "..", "..", "docs", "brand");
// fundo dos ícones da web (public/icons)
const BACKGROUND = "#111111";

const symbol = readFileSync(path.join(BRAND, "groscove-ultra-simbolo.svg"), "utf8");
const wordmark = readFileSync(path.join(BRAND, "groscove-ultra-principal.svg"), "utf8");
const white = (svg) => svg.replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#FFFFFF"');

/** Desenha o SVG com `width` px de largura, centrado num quadro size×size (fundo opcional). */
async function centered(svg, size, width, background) {
  const mark = await sharp(Buffer.from(svg), { density: 600 }).resize({ width: Math.round(width) }).png().toBuffer();
  const canvas = sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: mark, gravity: "center" }]);
  return background ? canvas.flatten({ background }).removeAlpha().png() : canvas.png();
}

await (await centered(symbol, 1024, 1024 * 0.66, BACKGROUND)).toFile(path.join(OUT, "icon.png"));
await (await centered(symbol, 1024, 1024 * 0.5)).toFile(path.join(OUT, "adaptive-icon.png"));
await (await centered(symbol, 1024, 1024 * 0.7)).toFile(path.join(OUT, "splash-icon.png"));
await (await centered(white(symbol), 96, 96 * 0.9)).toFile(path.join(OUT, "notification-icon.png"));
// ficha do Google Play: ícone 512 (sem alfa) e feature graphic 1024x500 com a logomarca completa
await (await centered(symbol, 512, 512 * 0.66, BACKGROUND)).toFile(path.join(OUT, "store-icon-512.png"));
// no fundo escuro o texto (#111) vira branco e o "A" segue laranja
const banner = await sharp(Buffer.from(wordmark.replace(/fill="#111(111)?"/g, 'fill="#FFFFFF"')), { density: 600 }).resize({ height: 240 }).png().toBuffer();
await sharp({ create: { width: 1024, height: 500, channels: 3, background: BACKGROUND } })
  .composite([{ input: banner, gravity: "center" }])
  .flatten({ background: BACKGROUND })
  .removeAlpha()
  .png()
  .toFile(path.join(OUT, "feature-graphic-1024x500.png"));
console.log("assets gerados em", OUT);
