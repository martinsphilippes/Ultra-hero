# Marca Groscove Ultra

- Fonte: `GROSCOVE_ULTRA_Principal_Preto_Laranja` e `GROSCOVE_ULTRA_Branco` (PDF com a logo em imagem, 1423×406).
- Vetorização: traçado automático da imagem oficial em 3× (potrace), separando o texto (GROSCOVE + ULTR) do
  "A" em triângulo laranja. Os caminhos usados no app ficam em `src/components/layout/brand-paths.ts`.
- Laranja do triângulo medido no arquivo: `#FD4F05`.
- Uso no app: logo completa no topo de todas as telas (texto na cor do tema, triângulo laranja), símbolo
  (triângulo) nos títulos de seção, na abertura animada e nos ícones (fundo `#111111`).
- Quando houver o arquivo vetorial original (AI/SVG/EPS), substitua os caminhos em `brand-paths.ts` por ele.
- Atalho na Tela de Início: ícones `public/icons/groscove-*.png` (nome novo para o celular não reaproveitar o
  ícone antigo guardado) e telas de abertura do iPhone/iPad em `public/splash/` (logo completa, texto branco,
  fundo `#0B0B0B`), geradas por `node scripts/generate-splash.mjs` a partir de `brand-paths.ts`; aparelhos em
  `src/lib/pwa/startup-devices.json`.
