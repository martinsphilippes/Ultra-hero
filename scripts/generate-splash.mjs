// Gera as telas de abertura do iPhone/iPad (apple-touch-startup-image) com a logomarca completa
// Groscove Ultra (texto branco, triângulo laranja) sobre o fundo do app. Uso: node scripts/generate-splash.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const src = readFileSync(new URL("../src/components/layout/brand-paths.ts", import.meta.url), "utf8");
const pick = (name) => src.match(new RegExp(`export const ${name} = "([^"]+)"`))[1];
const num = (name) => Number(src.match(new RegExp(`export const ${name} = (\\d+)`))[1]);
const [W, H] = [num("LOGO_WIDTH"), num("LOGO_HEIGHT")];
const devices = JSON.parse(readFileSync(new URL("../src/lib/pwa/startup-devices.json", import.meta.url), "utf8"));
const BG = "#0B0B0B";

for (const d of devices) {
  const pw = d.w * d.dpr;
  const ph = d.h * d.dpr;
  // logo ocupa 64% da largura no celular e no máximo 46% no iPad
  const logoW = Math.round(pw * (d.w >= 700 ? 0.46 : 0.64));
  const logoH = Math.round((logoW * H) / W);
  const x = Math.round((pw - logoW) / 2);
  const y = Math.round((ph - logoH) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">
<rect width="100%" height="100%" fill="${BG}"/>
<svg x="${x}" y="${y}" width="${logoW}" height="${logoH}" viewBox="${pick("LOGO_VIEWBOX")}">
<path fill="#FFFFFF" d="${pick("LOGO_GROSCOVE_PATH")}"/><path fill="#FFFFFF" d="${pick("LOGO_ULTR_PATH")}"/><path fill="${pick("BRAND_ORANGE")}" d="${pick("LOGO_A_PATH")}"/>
</svg></svg>`;
  const out = `public/splash/groscove-${pw}x${ph}.png`;
  writeFileSync(out, await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer());
  console.log(out);
}
