import { getTranslations } from "next-intl/server";
import { buildIntroKeyframes, limbPath } from "@/lib/intro/poses";
import { BRAND_ORANGE } from "./Logo";

// Abertura animada (componente de servidor, sem JS no cliente). Fica no HTML de toda página, mas
// escondida (display:none) até o script inicial marcar data-intro no <html>; ver src/lib/intro/script.ts.
// Arte original: losango da marca + atleta genérico em silhueta, articulado e animado só com CSS.

const FAR = "#C2461B"; // membros de longe, um tom abaixo do laranja (profundidade)
const KEYFRAMES = buildIntroKeyframes();

const THIGH = limbPath(46, 20, 12);
const SHIN = limbPath(46, 12.5, 7.5);
const UPPER_ARM = limbPath(31, 13, 9);
const FOREARM = limbPath(29, 9, 6.5);
const FOOT = "M-4.5 -3.5L13 -2.5A3.2 3.2 0 0 1 13 3.9L-4.5 4A3.75 3.75 0 0 1 -4.5 -3.5Z";
// tronco de perfil: costas retas, peito à frente, cintura fina
const TORSO = "M-10 6C-13 -8 -11 -24 -9 -34C-11 -46 -10 -58 -5 -65C1 -71 10 -70 14 -63C18 -54 17 -42 11 -31C9 -21 11 -7 10 6C4 11 -4 11 -10 6Z";

function Leg({ side, fill }: { side: "N" | "F"; fill: string }) {
  return (
    <g className={`uh-j-hip${side}`}>
      <path d={THIGH} fill={fill} />
      <g transform="translate(0 46)">
        <g className={`uh-j-knee${side}`}>
          <path d={SHIN} fill={fill} />
          <g transform="translate(0 46)">
            <g className={`uh-j-ankle${side}`}>
              <path d={FOOT} fill={fill} />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

function Arm({ side, fill }: { side: "N" | "F"; fill: string }) {
  return (
    <g transform="translate(2 -58)">
      <g className={`uh-j-sh${side}`}>
        <path d={UPPER_ARM} fill={fill} />
        <g transform="translate(0 31)">
          <g className={`uh-j-el${side}`}>
            <path d={FOREARM} fill={fill} />
            <circle cy="30" r="5.2" fill={fill} />
          </g>
        </g>
      </g>
    </g>
  );
}

// Uma cópia do atleta. As de rastro usam o mesmo desenho com atraso (--lag) e menos opacidade.
function Athlete({ lag, opacity }: { lag: number; opacity: number }) {
  return (
    <g className="uh-fig" style={{ ["--lag" as string]: `${lag}s`, opacity }}>
      <g className="uh-fig-body">
        <Leg side="F" fill={FAR} />
        <g className="uh-j-torso">
          <Arm side="F" fill={FAR} />
          <path d={TORSO} fill={BRAND_ORANGE} />
          <path d="M-2 -64L6 -64L7 -76L-1 -76Z" fill={BRAND_ORANGE} />
          <ellipse cx="4" cy="-86" rx="10" ry="11.5" fill={BRAND_ORANGE} />
        </g>
        <Leg side="N" fill={BRAND_ORANGE} />
        {/* o braço de perto gira com o tronco, mas é desenhado por cima da perna de perto */}
        <g className="uh-j-torso">
          <Arm side="N" fill={BRAND_ORANGE} />
        </g>
      </g>
    </g>
  );
}

export async function AppIntro() {
  const t = await getTranslations("common.intro");
  return (
    <div className="uh-intro">
      <style>{KEYFRAMES}</style>
      <div className="uh-intro-scene">
        <svg className="uh-intro-stage" viewBox="0 0 360 480" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="uh-intro-glow">
              <stop offset="0" stopColor={BRAND_ORANGE} stopOpacity="0.38" />
              <stop offset="1" stopColor={BRAND_ORANGE} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="uh-intro-ground" x1="0" x2="1">
              <stop offset="0" stopColor="#F2EFEA" stopOpacity="0" />
              <stop offset="0.5" stopColor="#F2EFEA" stopOpacity="0.5" />
              <stop offset="1" stopColor="#F2EFEA" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="uh-intro-mark">
            <circle className="uh-intro-glow" r="130" fill="url(#uh-intro-glow)" />
            <path className="uh-intro-diamond" d="M0 -28L28 0L0 28L-28 0Z" fill={BRAND_ORANGE} />
          </g>
          <rect className="uh-intro-ground" x="0" y="431.5" width="360" height="1" fill="url(#uh-intro-ground)" />
          <ellipse className="uh-fig-shadow" rx="34" ry="4.5" fill={BRAND_ORANGE} />
          <Athlete lag={0.1} opacity={0.12} />
          <Athlete lag={0.05} opacity={0.26} />
          <Athlete lag={0} opacity={1} />
          <text className="uh-intro-word" x="180" textAnchor="middle">
            ULTRA HERO
          </text>
        </svg>
      </div>
      <button type="button" className="uh-intro-skip" aria-label={t("skipLabel")}>
        {t("skip")}
      </button>
    </div>
  );
}
