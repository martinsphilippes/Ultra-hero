import { Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { AvatarInitials } from "@/components/ui";
import { AvatarImage } from "@/components/ui/avatar-image";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { coverPhoto, phaseOf, type CollectibleView } from "@/lib/collectibles/queries";
import { cn } from "@/lib/utils";
import { Countdown } from "./Countdown";
import { LiveBadge } from "./LiveBadge";

type Props = { item: CollectibleView; serverNow: number; priority?: boolean };

/** Foto local é otimizada; SVG e endereço externo (foto enviada pelo admin) vão direto. */
export function photoUnoptimized(src: string) {
  return !src.startsWith("/") || src.endsWith(".svg");
}

// Cartão da vitrine: foto, herói, preço atual, contagem e número de lances.
export async function CollectibleCard({ item, serverNow, priority }: Props) {
  const [t, locale] = await Promise.all([getTranslations("collectibles"), getLocale()]);
  const phase = phaseOf(item, serverNow);
  const photo = coverPhoto(item);
  const price = formatCurrency(item.currentCents / 100, locale as Locale);

  return (
    <li data-testid="collectible-card" className="min-w-0">
      <Link
        href={`/shop/colecionaveis/${item.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="relative block aspect-[4/3] overflow-hidden bg-surface-elevated">
          <Image
            src={photo}
            alt=""
            fill
            priority={priority}
            unoptimized={photoUnoptimized(photo)}
            sizes="(min-width: 768px) 20rem, 100vw"
            className="object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03] motion-reduce:transition-none"
          />
          <span className="absolute left-2 top-2 flex gap-1.5">
            {phase === "live" ? <LiveBadge label={t("segment.live")} className="bg-black/70" /> : null}
            {item.isDemo ? (
              <span className="inline-flex h-5 items-center rounded-full bg-black/70 px-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-white">
                {t("demo")}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex flex-1 flex-col gap-2 p-3">
          {item.hero ? (
            <span className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated text-[0.625rem] font-bold uppercase">
                <AvatarImage src={item.hero.avatar_url} alt="" fallback={<AvatarInitials name={item.hero.name} />} fill sizes="24px" className="object-cover" />
              </span>
              <span className="truncate">{item.hero.name}</span>
            </span>
          ) : null}
          <span className="line-clamp-2 font-semibold leading-snug text-fg group-hover:underline">{item.title}</span>
          <span className="mt-auto flex items-end justify-between gap-2">
            <span className="flex flex-col">
              <span className="text-[0.6875rem] uppercase tracking-wider text-fg-subtle">
                {phase === "ended" ? t("card.finalPrice") : item.bidsCount > 0 ? t("card.currentBid") : t("card.startPrice")}
              </span>
              <span className="type-numeric text-lg font-bold text-fg">{price}</span>
            </span>
            <span className={cn("flex flex-col items-end text-right", phase === "ended" && "text-fg-muted")}>
              <span className="text-[0.6875rem] uppercase tracking-wider text-fg-subtle">
                {phase === "live" ? t("card.endsIn") : phase === "scheduled" ? t("card.startsIn") : t("card.ended")}
              </span>
              {phase === "live" || phase === "scheduled" ? (
                <Countdown target={phase === "live" ? item.endsAt : item.startsAt} serverNow={serverNow} className="text-sm font-semibold text-fg" />
              ) : (
                <span className="inline-flex items-center gap-1 text-sm font-semibold">
                  <Gavel aria-hidden="true" className="size-3.5" />
                  {t("card.bids", { n: item.bidsCount })}
                </span>
              )}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
