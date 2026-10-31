import type { SVGProps } from "react";

// Ícone da aba Hero: corredor em movimento com linhas de velocidade (pedido do responsável). Mesma
// gramática do Lucide (24×24, traço 2, pontas redondas) para casar com os outros ícones da barra.
export function HeroRunner({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="17" cy="4.5" r="2" />
      <path d="M14.5 8.5 12.5 13" />
      <path d="m14.5 8.5 3 2.5 3-1" />
      <path d="m14.5 8.5-3.5 1-1 3" />
      <path d="m12.5 13 3.5 2.5-1 4.5" />
      <path d="m12.5 13-3 3-1.5 4" />
      <path d="M2 10.5h3.5" />
      <path d="M1.5 13.5h4" />
      <path d="M2 16.5h3.5" />
    </svg>
  );
}
