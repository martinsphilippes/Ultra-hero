"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setCompareHeroAction } from "@/app/(app)/follow-actions";
import { AvatarInitials, useToast } from "@/components/ui";
import { AvatarImage } from "@/components/ui/avatar-image";
import { cn } from "@/lib/utils";
import { FollowButton } from "./FollowButton";
import { useConfirmedFollow, useFollowLookup } from "./follow-store";

export type ManagedHero = { id: string; slug: string; name: string; headline: string | null; avatarUrl: string | null };

type Props = {
  heroes: ManagedHero[];
  compareId: string | null;
  /** false = sem a 0056 no banco: só a lista com Seguir/Seguindo, sem a escolha de comparação. */
  compareAvailable: boolean;
  pushReady: boolean;
};

// Heróis que sigo: deixar de seguir (com volta: a linha fica com "Seguir") e escolher UM Hero de
// comparação entre os seguidos (rádio).
export function FollowedHeroesManager({ heroes, compareId, compareAvailable, pushReady }: Props) {
  const t = useTranslations("follows.manage");
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(compareId);
  const [pending, startTransition] = useTransition();
  const isFollowing = useFollowLookup();
  // deixar de seguir o escolhido limpa a escolha (o banco faz o mesmo)
  const current = selected && isFollowing(selected, true) ? selected : null;

  function choose(next: string | null) {
    const previous = current;
    setSelected(next);
    startTransition(async () => {
      const result = await setCompareHeroAction({ creatorId: next });
      if (!result.ok) {
        setSelected(previous);
        toast({ title: t(result.error === "not_following" ? "notFollowing" : result.error === "unavailable" ? "compareUnavailable" : "compareError"), variant: "error" });
        return;
      }
      toast({ title: next ? t("compareSaved") : t("compareCleared"), variant: "success", duration: 2500 });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" aria-label={t("listLabel")} data-testid="followed-heroes">
        {heroes.map((hero) => (
          <HeroRow key={hero.id} hero={hero} pushReady={pushReady} />
        ))}
      </ul>

      {compareAvailable ? (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="compare-picker" disabled={pending}>
          <legend className="sr-only">{t("compareTitle")}</legend>
          <div className="flex flex-col gap-1" aria-hidden="true">
            <p className="type-h3 text-fg">{t("compareTitle")}</p>
          </div>
          <p className="type-body-sm max-w-prose text-fg-muted">{t("compareDescription")}</p>
          <div className="flex flex-col gap-1">
            {heroes.map((hero) => (
              <CompareOption key={hero.id} hero={hero} checked={current === hero.id} onChoose={() => choose(hero.id)} label={t("compareWith", { name: hero.name })} />
            ))}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-hover">
              <input type="radio" name="compare-hero" className="size-5 accent-[var(--color-accent)]" checked={current === null} onChange={() => choose(null)} data-testid="compare-none" />
              <span className="text-sm text-fg">{t("compareNone")}</span>
            </label>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function HeroRow({ hero, pushReady }: { hero: ManagedHero; pushReady: boolean }) {
  const t = useTranslations("follows.manage");
  return (
    <li className="flex items-center gap-3 px-4 py-3" data-testid="followed-hero" data-slug={hero.slug}>
      <Link href={`/personalities/${hero.slug}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <span className="relative inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated text-sm font-bold uppercase text-fg-muted">
          <AvatarImage src={hero.avatarUrl} alt="" fallback={<AvatarInitials name={hero.name} />} fill sizes="44px" className="object-cover" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-fg">{hero.name}</span>
          {hero.headline ? <span className="truncate type-caption text-fg-muted">{hero.headline}</span> : null}
          <span className="sr-only">{t("openHero", { name: hero.name })}</span>
        </span>
      </Link>
      <FollowButton creatorId={hero.id} heroName={hero.name} initialFollowing signedIn path="/profile/herois" pushReady={pushReady} size="compact" />
    </li>
  );
}

function CompareOption({ hero, checked, onChoose, label }: { hero: ManagedHero; checked: boolean; onChoose: () => void; label: string }) {
  const following = useConfirmedFollow(hero.id, true);
  return (
    <label className={cn("flex min-h-11 items-center gap-3 rounded-lg px-2", following ? "cursor-pointer hover:bg-surface-hover" : "opacity-55")}>
      <input type="radio" name="compare-hero" className="size-5 accent-[var(--color-accent)]" checked={checked} disabled={!following} onChange={onChoose} data-testid={`compare-${hero.slug}`} />
      <span className="text-sm text-fg">{label}</span>
    </label>
  );
}
