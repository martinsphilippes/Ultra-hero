import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Peças visuais da Onda Digital (0132), no estilo da apresentação: blocos com fundo de "vitral", janelinhas com
// três bolinhas e "x" na barra, borda e sombra pretas, conchas, estrelas e a sereia.

export const ONDA = {
  ink: "#0c0c20",
  cream: "#fff6ea",
  yellow: "#ffd84d",
  coral: "#ff7f73",
  teal: "#12b5b8",
  purple: "#3a14c9",
  pink: "#f0185f",
  lightPink: "#ff9fb2",
  mint: "#7fe6d8",
  navy: "#0a3d6b",
  blue: "#0f9fc4",
} as const;

type BlockTone = "blue" | "yellow" | "navy" | "coral" | "purple" | "pink" | "cream" | "teal";

const BLOCK: Record<BlockTone, string> = {
  blue: "bg-[#0f9fc4] bg-[url('/onda-digital/vitral-azul.svg')] bg-cover bg-center text-white",
  yellow: "bg-[#ffd84d] bg-[url('/onda-digital/vitral-amarelo.svg')] bg-cover bg-center text-[#0c0c20]",
  navy: "bg-[#0a3d6b] bg-[url('/onda-digital/vitral-marinho.svg')] bg-cover bg-center text-white",
  coral: "bg-[#ff7f73] text-[#0c0c20]",
  purple: "bg-[#3a14c9] text-white",
  pink: "bg-[#f0185f] text-white",
  cream: "bg-[#fff6ea] text-[#0c0c20]",
  teal: "bg-[#12b5b8] text-[#0c0c20]",
};

/** Uma "tela" da apresentação: bloco com cantos arredondados, borda preta e o fundo da cor. */
export function OndaBlock({ tone, id, children, className, labelledBy }: { tone: BlockTone; id?: string; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("relative scroll-mt-20 overflow-hidden rounded-3xl border-2 border-[#0c0c20] px-4 py-7 sm:px-8 sm:py-10", BLOCK[tone], className)}
    >
      {children}
    </section>
  );
}

type Bar = "purple" | "pink" | "teal" | "coral" | "yellow" | "navy";
const BAR: Record<Bar, string> = {
  purple: "bg-[#3a14c9]",
  pink: "bg-[#f0185f]",
  teal: "bg-[#12b5b8]",
  coral: "bg-[#ff7f73]",
  yellow: "bg-[#ffd84d]",
  navy: "bg-[#0a3d6b]",
};

/** Janelinha da apresentação: barra colorida com três bolinhas amarelas e o "x". */
export function OndaWindow({ bar = "purple", children, className, bodyClassName }: { bar?: Bar; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={cn("relative border-2 border-[#0c0c20] bg-white text-[#0c0c20] shadow-[5px_5px_0_#0c0c20]", className)}>
      <div className={cn("flex h-7 items-center justify-between border-b-2 border-[#0c0c20] px-3", BAR[bar])} aria-hidden="true">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ffd84d]" />
          <span className="size-2.5 rounded-full bg-[#ffd84d]" />
          <span className="size-2.5 rounded-full bg-[#ffd84d]" />
        </span>
        <span className={cn("text-xs font-bold", bar === "yellow" ? "text-[#0c0c20]" : "text-white")}>x</span>
      </div>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Enfeite decorativo (concha, estrela, sereia…), sem texto alternativo. */
export function Sticker({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/onda-digital/${src}.webp`} alt="" aria-hidden="true" loading="lazy" className={cn("pointer-events-none absolute select-none", className)} />;
}

/** Título em pílula branca com sombra roxa ("Quais são as páginas?"). */
export function OndaPill({ children, as: Tag = "h2", id, className }: { children: ReactNode; as?: "h2" | "h3"; id?: string; className?: string }) {
  return (
    <Tag
      id={id}
      className={cn(
        "inline-block rounded-full border-2 border-[#0c0c20] bg-white px-5 py-2 text-xl font-extrabold text-[#0c0c20] shadow-[4px_5px_0_#3a14c9] sm:text-3xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Destaque das frases da apresentação (<hl>…</hl> e <b>…</b> nas mensagens). */
export const hl = (chunks: ReactNode) => <span className="text-[#ffd84d]">{chunks}</span>;
export const hlPurple = (chunks: ReactNode) => <span className="text-[#3a14c9]">{chunks}</span>;
export const hlPink = (chunks: ReactNode) => <span className="text-[#f0185f]">{chunks}</span>;
export const strong = (chunks: ReactNode) => <strong className="font-extrabold">{chunks}</strong>;

/** Estilos dos botões da apresentação (amarelo com borda e sombra preta). */
export const ondaButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[#0c0c20] px-5 text-base font-extrabold shadow-[4px_4px_0_#0c0c20] transition-transform hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0c0c20] active:translate-y-0 disabled:opacity-60";
export const ondaButtonYellow = cn(ondaButton, "bg-[#ffd84d] text-[#0c0c20]");
export const ondaButtonCream = cn(ondaButton, "bg-[#fff6ea] text-[#0c0c20]");
export const ondaButtonPink = cn(ondaButton, "bg-[#f0185f] text-white");
