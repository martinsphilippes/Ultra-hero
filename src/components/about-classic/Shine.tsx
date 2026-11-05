import type { CSSProperties } from "react";
import { LOGO_A_PATH, LOGO_GROSCOVE_PATH, LOGO_ULTR_PATH, LOGO_VIEWBOX, MARK_VIEWBOX } from "@/components/layout/brand-paths";

// Luz que passa de tempo em tempo pelas logomarcas e pelas linhas do /sobre (a mesma ideia do brilho do teaser,
// mais suave para o fundo claro). Tudo decorativo (aria-hidden, sem ponteiro). Todas as peças usam o mesmo ciclo
// de 7,5 s; cada uma entra com um atraso diferente (delay), então a luz percorre a página de uma peça para a outra.
// Sem animação (reduzir movimento, cores forçadas) nada disso aparece. Estilos em sobre.css (.uh-sb-shine*).

type ShineProps = {
  /** "logo": GROSCOVE ULTRA inteiro; "mark": só o triângulo. */
  kind: "logo" | "mark";
  /** Atraso em segundos dentro do ciclo. */
  delay: number;
};

/** Cópias com a luz sobre uma logomarca. Vai dentro de um contêiner posicionado do mesmo tamanho do logo. */
export function Shine({ kind, delay }: ShineProps) {
  const style = { "--sb-shine-delay": `${delay}s` } as CSSProperties;
  const viewBox = kind === "logo" ? LOGO_VIEWBOX : MARK_VIEWBOX;
  const shapes = (letters: string, mark: string) => (
    <>
      {kind === "logo" && (
        <>
          <path d={LOGO_GROSCOVE_PATH} fill={letters} />
          <path d={LOGO_ULTR_PATH} fill={letters} />
        </>
      )}
      <path d={LOGO_A_PATH} fill={mark} />
    </>
  );
  return (
    <>
      <span aria-hidden="true" className="uh-sb-shine uh-sb-shine-halo" style={style}>
        <svg viewBox={viewBox} focusable="false" className="uh-sb-shine-svg">
          {shapes("#ff9a66", "#ff7a3d")}
        </svg>
      </span>
      <span aria-hidden="true" className="uh-sb-shine uh-sb-shine-gloss" style={style}>
        <svg viewBox={viewBox} focusable="false" className="uh-sb-shine-svg">
          {shapes("#ffffff", "#ffd2b8")}
        </svg>
      </span>
    </>
  );
}

type ShineLineProps = {
  /** Onde fica a linha dentro do contêiner posicionado (borda de cima ou de baixo). */
  edge?: "top" | "bottom";
  delay: number;
};

/** Luz correndo por uma linha fina (borda de seção). Vai dentro de um contêiner posicionado. */
export function ShineLine({ edge = "bottom", delay }: ShineLineProps) {
  return (
    <span
      aria-hidden="true"
      className="uh-sb-shine-line"
      data-edge={edge}
      style={{ "--sb-shine-delay": `${delay}s` } as CSSProperties}
    />
  );
}
