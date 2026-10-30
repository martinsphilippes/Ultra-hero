import { ChevronRight, Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { coverPhoto, phaseOf, type MyBidRow } from "@/lib/collectibles/queries";
import { bidderStanding, type BidderStanding } from "@/lib/collectibles/rules";
import { cn } from "@/lib/utils";
import { Countdown } from "./Countdown";
import { photoUnoptimized } from "./CollectibleCard";

const TONES: Record<BidderStanding, string> = {
  winning: "border-success/40 bg-success-soft text-success",
  outbid: "border-warning/40 bg-warning-soft text-warning",
  won: "border-accent/40 bg-accent-soft text-accent-text",
  lost: "border-border bg-surface-hover text-fg-muted",
  cancelled: "border-danger/40 bg-danger-soft text-danger",
  watching: "border-border bg-surface-hover text-fg-muted",
};

// "Lances e arremates" em Minhas compras: cada item em que a pessoa deu lance, com a situação
// (vencendo, superado, arrematado, encerrado), o maior lance dela e, se venceu, o pedido ou o pagamento.
export async function MyBidsList({ rows, serverNow }: { rows: MyBidRow[]; serverNow: number }) {
  const [t, locale] = await Promise.all([getTranslations("collectibles.myBids"), getLocale()]);
  const money = (cents: number) => formatCurrency(cents / 100, locale as Locale);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
          icon={<Gavel />}
          title={t("empty")}
          description={t("emptyDescription")}
          action={
            <Button asChild>
              <Link href="/shop/colecionaveis">{t("goToCollectibles")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label={t("listLabel")} data-testid="my-bids">
      {rows.map((row) => {
        const phase = phaseOf(row.item, serverNow);
        const standing = bidderStanding({ phase, leadingBidId: row.item.leadingBidId, myBidIds: row.myBidIds, iWon: row.won });
        const photo = coverPhoto(row.item);
        return (
          <li key={row.item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
            <Link
              href={`/shop/colecionaveis/${row.item.id}`}
              className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-elevated">
                <Image src={photo} alt="" fill unoptimized={photoUnoptimized(photo)} sizes="64px" className="object-cover" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm font-semibold text-fg">{row.item.title}</span>
                <span className={cn("w-fit rounded-full border px-2 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider", TONES[standing])} data-standing={standing}>
                  {t(`standing.${standing}`)}
                </span>
                <span className="text-xs text-fg-muted">
                  {t("myTop", { price: money(row.myTopCents) })} · {phase === "ended" || phase === "cancelled" ? t("final", { price: money(row.item.currentCents) }) : t("current", { price: money(row.item.currentCents) })}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {phase === "live" ? <Countdown target={row.item.endsAt} serverNow={serverNow} className="text-xs font-semibold text-fg" /> : null}
                <ChevronRight aria-hidden="true" className="size-5 text-fg-muted" />
              </span>
            </Link>
            {standing === "won" ? (
              row.claimStatus === "paid" && row.orderId ? (
                <Button asChild variant="secondary" size="sm" block>
                  <Link href={`/orders/${row.orderId}`}>{t("viewOrder")}</Link>
                </Button>
              ) : (
                <Button asChild size="sm" block>
                  <Link href={`/shop/colecionaveis/${row.item.id}/pagamento`}>{t("payCta")}</Link>
                </Button>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
