import { BRAND_NAME } from "@/components/layout/Logo";
import { BRAND_ORANGE, LOGO_A_PATH, LOGO_GROSCOVE_PATH, LOGO_HEIGHT, LOGO_ULTR_PATH, LOGO_VIEWBOX } from "@/components/layout/brand-paths";

// Logo do teaser (pedido do dono, 04/11): nome SEMPRE em branco nítido (#f2efea, o texto claro do tema escuro) e o
// triângulo laranja oficial, em qualquer tema/navegador — a cor é fixa no próprio SVG, não depende de tokens do app.
// (Antes usava <Logo>, cujo `text-fg` resolve para var(--uh-fg) por causa do `@theme inline`; com o tema claro salvo
// o nome saía #141414 sobre o fundo preto, quase invisível.)
// O brilho é uma faixa recortada pelo PRÓPRIO desenho das letras (clipPath com os caminhos GROSCOVE + ULTR): o
// reflexo só existe dentro das letras, nunca como retângulo sobre o fundo. A faixa fica invisível por padrão e só
// anda em prefers-reduced-motion: no-preference (teaser.css). Um único logo por página, então os ids são fixos.
// Para leitores de tela é uma imagem só ("Groscove Ultra"); o recorte do brilho fica fora da árvore de acessibilidade.
const CLIP_ID = "uh-tz-logo-letters";
const SHEEN_ID = "uh-tz-logo-sheen";
const LETTERS_FILL = "#f2efea";

export function LaunchLogo() {
  return (
    <svg viewBox={LOGO_VIEWBOX} role="img" aria-label={BRAND_NAME} className="uh-tz-logo-svg" data-testid="brand-logo">
      <defs>
        <clipPath id={CLIP_ID}>
          <path d={LOGO_GROSCOVE_PATH} />
          <path d={LOGO_ULTR_PATH} />
        </clipPath>
        <linearGradient id={SHEEN_ID} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffc9ad" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.65" stopColor="#ffc9ad" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={LOGO_GROSCOVE_PATH} fill={LETTERS_FILL} />
      <path d={LOGO_ULTR_PATH} fill={LETTERS_FILL} />
      <path d={LOGO_A_PATH} fill={BRAND_ORANGE} />
      <g clipPath={`url(#${CLIP_ID})`} aria-hidden="true">
        {/* faixa inclinada que começa à esquerda, fora do desenho, e atravessa até passar da borda direita */}
        <polygon
          className="uh-tz-logo-sheen"
          points={`-180,0 0,0 -120,${LOGO_HEIGHT} -300,${LOGO_HEIGHT}`}
          fill={`url(#${SHEEN_ID})`}
        />
      </g>
    </svg>
  );
}
