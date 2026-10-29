import { ChefHat, FilePlus2, Files, LayoutDashboard, Link2, SquarePen, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// Atalhos do Portal do herói direto no Perfil, perto de "Editar perfil": os mesmos destinos do menu do
// portal (nada novo), em botões pequenos — 3 por linha no celular (3×2), 6 numa linha no desktop.
const ACTIONS: Array<{ key: "post" | "newContent" | "content" | "recipes" | "links" | "dashboard"; href: string; icon: LucideIcon }> = [
  { key: "post", href: "/creator/post/new", icon: SquarePen },
  { key: "newContent", href: "/creator/content/new", icon: FilePlus2 },
  { key: "content", href: "/creator/content", icon: Files },
  { key: "recipes", href: "/creator/recipes", icon: ChefHat },
  { key: "links", href: "/creator/links", icon: Link2 },
  { key: "dashboard", href: "/creator", icon: LayoutDashboard },
];

export async function HeroQuickActions() {
  const t = await getTranslations("me.profile.heroActions");
  return (
    <nav aria-label={t("label")} data-testid="hero-quick-actions">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ACTIONS.map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link
              href={href}
              data-testid={`hero-action-${key}`}
              className="flex h-full min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-2.5 text-center transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Icon className="size-5 text-accent-text" aria-hidden="true" />
              <span className="text-xs font-semibold leading-tight text-fg">{t(key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
