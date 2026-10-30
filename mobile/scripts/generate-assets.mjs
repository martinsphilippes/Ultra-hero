// Ícones e splash da casca, a partir da mesma geometria do ícone PWA (losango laranja sobre obsidiana;
// scripts/generate-icons.mjs na raiz). Provisórios até a marca GC Hero: troque a forma aqui e rode
//   node mobile/scripts/generate-assets.mjs
// Lições do Quantso (docs/operations/publicacao-nas-lojas.md lá): ícone da Apple sem alfa; adaptive
// icon com a marca dentro da zona segura (66%) e fundo transparente, a cor vem de backgroundColor.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const OBSIDIAN = "#0B0B0B";
const ORANGE = "#FF5A1F";

// losango ocupando `scale` do quadro, centrado
const diamond = (size, scale, background) => {
  const half = (size * scale) / 2;
  const c = size / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg}<polygon points="${c},${c - half} ${c + half},${c} ${c},${c + half} ${c - half},${c}" fill="${ORANGE}"/></svg>`,
  );
};

await sharp(diamond(1024, 0.62, OBSIDIAN)).flatten({ background: OBSIDIAN }).removeAlpha().png().toFile(path.join(OUT, "icon.png"));
await sharp(diamond(1024, 0.42)).png().toFile(path.join(OUT, "adaptive-icon.png"));
await sharp(diamond(1024, 0.6)).png().toFile(path.join(OUT, "splash-icon.png"));
// ficha do Google Play: ícone 512 (sem alfa) e feature graphic 1024x500
await sharp(diamond(512, 0.62, OBSIDIAN)).flatten({ background: OBSIDIAN }).removeAlpha().png().toFile(path.join(OUT, "store-icon-512.png"));
await sharp({ create: { width: 1024, height: 500, channels: 3, background: OBSIDIAN } })
  .composite([{ input: await sharp(diamond(300, 0.9)).png().toBuffer(), left: 362, top: 100 }])
  .flatten({ background: OBSIDIAN })
  .removeAlpha()
  .png()
  .toFile(path.join(OUT, "feature-graphic-1024x500.png"));
console.log("assets gerados em", OUT);
