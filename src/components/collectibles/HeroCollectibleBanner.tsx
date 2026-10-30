import { ChevronRight, Gem } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { coverPhoto, fetchHeroCollectibles, phaseOf } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";
import { photoUnoptimized } from "./CollectibleCard";
import { Countdown } from "./Countdown";
import { LiveBadge } from "./LiveBadge";

// Página do herói: cartão pequeno "Colecionáveis" quando ele tem item ao vivo ou agendado
// (o que acaba primeiro). Sem item ou sem a 0054, não aparece nada.
export async function HeroCollectibleBanner({ creatorId }: { creatorId: string }) {
  const supabase = await createClient();
  const items = await fetchHeroCollectibles(supabase, creatorId);
  const serverNow = Date.now();
  const item = items.find((i) => phaseOf(i, serverNow) === "live") ?? items[0];
  if (!item) return null;
  const [t, locale] = await Promise.all([getTranslations("collectibles"), getLocale()]);
  const live = phaseOf(item, serverNow) === "live";
  const photo = coverPhoto(item);

  return (
    <Link
      href={`/shop/colecionaveis/${item.id}`}
      data-testid="hero-collectible-banner"
      className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-surface p-2.5 pr-3 transition-colors hover:border-accent/60 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-elevated">
        <Image src={photo} alt="" fill unoptimized={photoUnoptimized(photo)} sizes="56px" className="object-cover" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
          <Gem aria-hidden="true" className="size-3.5" />
          {t("segment.collectibles")}
          {live ? <LiveBadge label={t("segment.live")} /> : null}
        </span>
        <span className="truncate text-sm font-semibold text-fg">{item.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="type-numeric font-semibold text-fg">{formatCurrency(item.currentCents / 100, locale as Locale)}</span>·
          <span>{live ? t("card.endsIn") : t("card.startsIn")}</span>
          <Countdown target={live ? item.endsAt : item.startsAt} serverNow={serverNow} className="font-semibold text-fg" />
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
    </Link>
  );
}
