import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { coverPhoto, fetchLiveSummary } from "@/lib/collectibles/queries";
import { photoUnoptimized } from "./CollectibleCard";
import { Countdown } from "./Countdown";
import { LiveBadge } from "./LiveBadge";

// Social (/inicio): destaque pequeno "Ao vivo" no topo quando há colecionável com lance aberto.
// Leva ao item que acaba primeiro (ou à vitrine, se houver vários).
export async function LiveHighlight() {
  const summary = await fetchLiveSummary();
  if (!summary.available || !summary.next) return null;
  const [t, locale] = await Promise.all([getTranslations("collectibles"), getLocale()]);
  const item = summary.next;
  const photo = coverPhoto(item);
  const serverNow = Date.now();
  const href = summary.liveCount > 1 ? "/shop/colecionaveis" : `/shop/colecionaveis/${item.id}`;

  return (
    <Link
      href={href}
      data-testid="live-collectible-highlight"
      className="mx-gutter flex items-center gap-3 rounded-2xl border border-danger/30 bg-surface p-2.5 pr-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:mx-0"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-surface-elevated">
        <Image src={photo} alt="" fill unoptimized={photoUnoptimized(photo)} sizes="48px" className="object-cover" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <LiveBadge label={t("segment.live")} />
          <span className="truncate text-xs text-fg-muted">
            {summary.liveCount > 1 ? t("highlight.many", { n: summary.liveCount }) : t("segment.collectibles")}
          </span>
        </span>
        <span className="truncate text-sm font-semibold text-fg">{item.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="type-numeric font-semibold text-fg">{formatCurrency(item.currentCents / 100, locale as Locale)}</span>·
          <Countdown target={item.endsAt} serverNow={serverNow} className="font-semibold text-fg" />
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
    </Link>
  );
}
