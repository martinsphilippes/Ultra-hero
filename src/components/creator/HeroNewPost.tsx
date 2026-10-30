import { SquarePen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// O herói só posta no dia a dia (foto ou vídeo pelo composer); conteúdos, receitas, vínculos e painel
// são da administração (Publicar como hero, 0045). Um botão grande, perto de "Editar perfil".
export async function HeroNewPost({ href }: { href: string }) {
  const t = await getTranslations("me.profile.newPost");
  return (
    <Link
      href={href}
      data-testid="hero-new-post"
      className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-base font-semibold text-accent-fg shadow-sm transition-[background-color,box-shadow] hover:bg-accent-hover hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <SquarePen className="size-5" aria-hidden="true" />
      <span>{t("label")}</span>
    </Link>
  );
}
