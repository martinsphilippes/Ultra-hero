"use client";

import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { heroCardForPath, heroPickerHref } from "@/lib/acting-hero/constants";

type Props = { hero: { name: string; avatar_url: string | null } };

// Faixa do fluxo "Publicar como hero": deixa claro em nome de quem o admin está publicando e leva ao
// seletor para trocar, voltando ao mesmo atalho com o novo herói.
export function ActingHeroBanner({ hero }: Props) {
  const t = useTranslations("adminOps.heroPublishing.banner");
  const pathname = usePathname();
  return (
    <div role="region" aria-label={t("region")} data-testid="acting-hero-banner" className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-4 py-2">
      <p className="flex min-w-0 items-center gap-2 text-sm text-fg">
        <Avatar src={hero.avatar_url} name={hero.name} size="sm" alt="" />
        <span className="min-w-0 truncate">
          {t("label")} <strong className="font-semibold" data-testid="acting-hero-name">{hero.name}</strong>
        </span>
      </p>
      <Link
        href={heroPickerHref(heroCardForPath(pathname))}
        data-testid="acting-hero-switch"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeftRight className="size-4" aria-hidden="true" />
        {t("switch")}
      </Link>
    </div>
  );
}
