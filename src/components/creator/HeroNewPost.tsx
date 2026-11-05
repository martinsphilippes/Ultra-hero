import { FileText, SquarePen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

const BUTTON =
  "flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold shadow-sm transition-[background-color,box-shadow] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Topo do Hero no Perfil (0092): dois caminhos claros, lado a lado — "Novo post" (rápido: foto ou vídeo do
// celular) e "Novo conteúdo" (estruturado: blocos de treino, nutrição, cardápio, programa e produtos) — cada um
// com uma linha curta explicando a diferença, e o atalho para "Meus conteúdos". Sem contentHref (talento sem
// página), só o Novo post.
export async function HeroNewPost({ href, contentHref = null, listHref = null }: { href: string; contentHref?: string | null; listHref?: string | null }) {
  const t = await getTranslations("me.profile");
  return (
    <div className="flex flex-col gap-2" data-testid="hero-create-actions">
      <div className={contentHref ? "grid grid-cols-2 gap-2" : "flex flex-col"}>
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={href} data-testid="hero-new-post" aria-describedby="hero-new-post-hint" className={`${BUTTON} bg-accent text-accent-fg hover:bg-accent-hover`}>
            <SquarePen className="size-5 shrink-0" aria-hidden="true" />
            <span>{t("newPost.label")}</span>
          </Link>
          {contentHref ? (
            <p id="hero-new-post-hint" className="type-caption text-center text-fg-muted">
              {t("newPost.hint")}
            </p>
          ) : null}
        </div>
        {contentHref ? (
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={contentHref}
              data-testid="hero-new-content"
              aria-describedby="hero-new-content-hint"
              className={`${BUTTON} border border-accent/50 bg-surface text-fg hover:bg-accent-soft`}
            >
              <FileText className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <span>{t("newContent.label")}</span>
            </Link>
            <p id="hero-new-content-hint" className="type-caption text-center text-fg-muted">
              {t("newContent.hint")}
            </p>
          </div>
        ) : null}
      </div>
      {listHref ? (
        <Link href={listHref} data-testid="hero-my-content" className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("newContent.myContent")}
        </Link>
      ) : null}
    </div>
  );
}
