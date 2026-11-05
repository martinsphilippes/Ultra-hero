import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { AvatarImage } from "@/components/ui/avatar-image";
import { AvatarInitials } from "@/components/ui/avatar";

export type CastingCardProps = {
  href: string;
  name: string;
  photoUrl: string | null;
  /** Texto do selo (ex.: "Musical artist"); sem selo cai no rótulo genérico. */
  category: string | null;
  /** Os temas do Hero (até 3 aparecem, um por linha). */
  topics: string[];
  instagram: { handle: string; url: string | null } | null;
  /** Informações de gestão, discretas, no pé do cartão. */
  meta?: ReactNode;
  testId?: string;
};

// Cartão do casting no formato do documento "Casting Groscove 2027": fundo escuro, foto em retrato à esquerda e, à
// direita, selo de verificado + categoria, nome grande, temas separados por fios finos e o @ do Instagram (nova aba).
// O cartão inteiro abre a ficha (link "esticado" no nome); o @ fica por cima com o próprio link. Sem foto: iniciais.
// O fundo é escuro nos dois temas (como o documento); as cores ficam todas aqui, sem depender do tema do app.
export function CastingCard({ href, name, photoUrl, category, topics, instagram, meta, testId }: CastingCardProps) {
  const t = useTranslations("agency.casting.card");
  const shown = topics.filter(Boolean).slice(0, 3);
  const handle = instagram?.handle.replace(/^@/, "") ?? null;
  const igUrl = instagram?.url || (handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : null);
  return (
    <article
      className="group relative flex h-full min-w-0 overflow-hidden rounded-2xl bg-[#0b0d10] text-white ring-1 ring-white/10 transition-shadow focus-within:ring-2 focus-within:ring-[#3b82f6] hover:ring-white/25"
      data-testid={testId}
    >
      <div className="relative w-[40%] shrink-0 self-stretch bg-[#16191f]">
        <div className="relative aspect-[3/4] h-full w-full">
          <AvatarImage
            src={photoUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 180px, (min-width: 640px) 22vw, 40vw"
            className="object-cover object-top"
            fallback={
              <span className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold uppercase tracking-wide text-white/70" aria-hidden="true">
                <AvatarInitials name={name} />
              </span>
            }
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/60">
          <BadgeCheck className="size-4 shrink-0 fill-[#2f80ed] text-[#0b0d10]" aria-label={t("verified")} role="img" />
          <span className="truncate">{category || t("defaultCategory")}</span>
        </p>
        <h3 className="text-xl font-extrabold leading-[1.05] tracking-tight [overflow-wrap:anywhere] sm:text-2xl">
          <Link href={href} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {name}
          </Link>
        </h3>
        {shown.length > 0 ? (
          <ul className="mt-auto flex flex-col border-b border-white/10 text-sm text-white/85">
            {shown.map((topic) => (
              <li key={topic} className="truncate border-t border-white/10 py-1.5">
                {topic}
              </li>
            ))}
          </ul>
        ) : (
          <span className="mt-auto" />
        )}
        <div className="flex flex-col gap-1.5">
          {handle && igUrl ? (
            <a
              href={igUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 self-start truncate text-sm font-semibold text-white underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
              aria-label={t("instagram", { handle })}
              data-testid="casting-card-instagram"
            >
              @{handle}
            </a>
          ) : null}
          {meta ? <div className="text-[0.6875rem] leading-snug text-white/55">{meta}</div> : null}
        </div>
      </div>
    </article>
  );
}
