import { BRAND_NAME } from "@/components/layout/Logo";
import { BRAND_ORANGE, LOGO_A_PATH, LOGO_GROSCOVE_PATH, LOGO_ULTR_PATH, LOGO_VIEWBOX } from "@/components/layout/brand-paths";

// Logo do teaser (pedido do dono, 04/11): nome SEMPRE em branco nítido (#f2efea, o texto claro do tema escuro) e o
// triângulo laranja oficial, em qualquer tema/navegador — a cor é fixa no próprio SVG, não depende de tokens do app.
// (Antes usava <Logo>, cujo `text-fg` resolve para var(--uh-fg) por causa do `@theme inline`; com o tema claro salvo
// o nome saía #141414 sobre o fundo preto, quase invisível.)
//
// Brilho (pedido do dono, 04/11 — 3ª rodada): a luz atravessa a marca INTEIRA (GROSCOVE + ULTR + o triângulo) e deixa
// um clarão suave em volta das formas enquanto passa. São duas cópias decorativas (aria-hidden) do mesmo desenho,
// empilhadas sobre o logo real e mascaradas pela MESMA faixa inclinada (mask-image + mask-position animado em
// teaser.css), então andam sempre juntas:
//   - halo (atrás do logo): cópia desfocada em branco quente/laranja — só aparece em volta das letras, onde a faixa
//     está; fora das formas a cópia é transparente, então nunca vira retângulo no fundo da página;
//   - reflexo (na frente): cópia com as letras em branco e o triângulo num laranja claro (#ffb994) — no laranja o
//     reflexo clareia sem virar branco chapado.
// As cópias ficam em display: none por padrão e só existem em prefers-reduced-motion: no-preference (sem
// "reduzir movimento" e sem cores forçadas): o logo estático é só o desenho real. Leitor de tela lê uma imagem só.
const LETTERS_FILL = "#f2efea";

function LogoShapes({ letters, mark }: { letters: string; mark: string }) {
  return (
    <>
      <path d={LOGO_GROSCOVE_PATH} fill={letters} />
      <path d={LOGO_ULTR_PATH} fill={letters} />
      <path d={LOGO_A_PATH} fill={mark} />
    </>
  );
}

export function LaunchLogo() {
  return (
    <>
      <span aria-hidden="true" className="uh-tz-shine uh-tz-shine-halo">
        <svg viewBox={LOGO_VIEWBOX} focusable="false" className="uh-tz-shine-svg">
          <LogoShapes letters="#ffe2d2" mark="#ff7a3d" />
        </svg>
      </span>
      <svg viewBox={LOGO_VIEWBOX} role="img" aria-label={BRAND_NAME} className="uh-tz-logo-svg" data-testid="brand-logo">
        <LogoShapes letters={LETTERS_FILL} mark={BRAND_ORANGE} />
      </svg>
      <span aria-hidden="true" className="uh-tz-shine uh-tz-shine-gloss">
        <svg viewBox={LOGO_VIEWBOX} focusable="false" className="uh-tz-shine-svg">
          <LogoShapes letters="#fff6ef" mark="#ffb994" />
        </svg>
      </span>
    </>
  );
}
