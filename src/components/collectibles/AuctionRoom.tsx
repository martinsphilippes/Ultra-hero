"use client";

import { CheckCircle2, Clock, Gavel, Info, LogIn, Radio, RefreshCw, Trophy, TriangleAlert, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { placeBidAction } from "@/app/(app)/shop/colecionaveis/actions";
import { Button, Sheet, useToast } from "@/components/ui";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { Locale } from "@/i18n/config";
import type { CollectibleView, MyCollectibleState, PublicBid } from "@/lib/collectibles/queries";
import {
  bidderStanding,
  clockOffsetMs,
  collectiblePhase,
  formatCountdown,
  isUrgent,
  nextBidAmount,
  type BidderStanding,
} from "@/lib/collectibles/rules";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LiveBadge } from "./LiveBadge";
import "./collectibles.css";

type Snapshot = { item: CollectibleView; bids: PublicBid[]; mine: MyCollectibleState };

type Props = {
  initial: Snapshot;
  serverNow: number;
  viewer: "anon" | "user" | "admin";
  loginHref: string;
  /** Admin acompanhando: sem botões de lance. */
  mode?: "consumer" | "admin";
};

type Connection = "connecting" | "realtime" | "polling";

const POLL_MS = 3000;
const SAFETY_MS = 20000;
const ANNOUNCE_EVERY_MS = 4000;
const MAX_FEED = 30;

function money(cents: number, locale: string, whole = false) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: whole && cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function mergeBids(current: PublicBid[], incoming: PublicBid[]): PublicBid[] {
  const map = new Map(current.map((b) => [b.id, b]));
  for (const b of incoming) map.set(b.id, b);
  return [...map.values()].sort((a, b) => b.amountCents - a.amountCents).slice(0, MAX_FEED);
}

// Sala do lance ao vivo: preço grande, contagem pelo relógio do servidor, lances chegando pelo
// Supabase Realtime (ou consulta a cada 3 s se o Realtime não conectar), botões de lance rápido
// com confirmação e a situação de quem assiste (vencendo, superado, arrematou, encerrado).
export function AuctionRoom({ initial, serverNow, viewer, loginHref, mode = "consumer" }: Props) {
  const t = useTranslations("collectibles.room");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const id = initial.item.id;

  const [item, setItem] = useState(initial.item);
  const [bids, setBids] = useState(initial.bids);
  const [mine, setMine] = useState(initial.mine);
  const offsetRef = useRef<number | null>(null);
  const bidsRef = useRef(initial.bids);
  const [now, setNow] = useState(serverNow);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [freshBidIds, setFreshBidIds] = useState<ReadonlySet<string>>(new Set());
  const [confirmIncrement, setConfirmIncrement] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");

  const myBidIds = useMemo(() => new Set(mine.bidIds), [mine.bidIds]);
  const phase = collectiblePhase(item.status, item.startsAt, item.endsAt, now);
  const standing = bidderStanding({ phase, leadingBidId: item.leadingBidId, myBidIds, iWon: mine.won });
  const remaining = phase === "live" ? Math.max(0, Date.parse(item.endsAt ?? "") - now) : phase === "scheduled" ? Math.max(0, Date.parse(item.startsAt ?? "") - now) : 0;
  const urgent = phase === "live" && isUrgent(remaining);

  // ---------------------------------------------------------------- relógio (corrigido pelo servidor)
  useEffect(() => {
    // 1ª estimativa: hora do servidor ao gerar a página; depois, a medida por ida e volta (refresh)
    if (offsetRef.current === null) offsetRef.current = serverNow - Date.now();
    const tick = () => setNow(Date.now() + (offsetRef.current ?? 0));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  useEffect(() => {
    bidsRef.current = bids;
  }, [bids]);

  // ---------------------------------------------------------------- estado completo (reserva e conferência)
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const sentAt = Date.now();
    try {
      const res = await fetch(`/api/collectibles/${id}/state`, { cache: "no-store" });
      const receivedAt = Date.now();
      if (!res.ok) return;
      const data = (await res.json()) as Snapshot & { serverNow: number };
      offsetRef.current = clockOffsetMs(data.serverNow, sentAt, receivedAt);
      const known = new Set(bidsRef.current.map((b) => b.id));
      const fresh = data.bids.filter((b) => !known.has(b.id)).map((b) => b.id);
      if (fresh.length > 0 && known.size > 0) setFreshBidIds(new Set(fresh));
      setItem(data.item);
      setBids(mergeBids([], data.bids));
      setMine(data.mine);
    } catch {
      // rede instável: a próxima rodada tenta de novo
    } finally {
      refreshing.current = false;
    }
  }, [id]);

  // ---------------------------------------------------------------- Realtime (postgres_changes) com reserva
  const subscribable = item.status !== "draft";
  useEffect(() => {
    if (!subscribable) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      setConnection("polling");
      return;
    }
    let subscribed = false;
    const fallback = window.setTimeout(() => {
      if (!subscribed) setConnection("polling");
    }, 5000);
    const channel = supabase
      .channel(`collectible-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "collectible_bids", filter: `collectible_id=eq.${id}` }, (payload) => {
        const row = payload.new as { id: string; amount_cents: number; bidder_label: string | null; created_at: string };
        const bid: PublicBid = { id: row.id, amountCents: row.amount_cents, label: row.bidder_label, createdAt: row.created_at };
        setBids((current) => (current.some((b) => b.id === bid.id) ? current : mergeBids(current, [bid])));
        setFreshBidIds(new Set([bid.id]));
        setItem((current) =>
          bid.amountCents > current.currentCents
            ? { ...current, currentCents: bid.amountCents, leadingBidId: bid.id, bidsCount: current.bidsCount + 1 }
            : current,
        );
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "collectibles", filter: `id=eq.${id}` }, (payload) => {
        const row = payload.new as {
          current_cents: number;
          bids_count: number;
          leading_bid_id: string | null;
          ends_at: string | null;
          starts_at: string | null;
          status: string;
          extensions_count: number;
          winner_label: string | null;
          finalized_at: string | null;
          title: string;
        };
        setItem((current) => ({
          ...current,
          currentCents: Math.max(current.currentCents, row.current_cents),
          bidsCount: Math.max(current.bidsCount, row.bids_count),
          leadingBidId: row.current_cents >= current.currentCents ? row.leading_bid_id : current.leadingBidId,
          endsAt: row.ends_at,
          startsAt: row.starts_at,
          status: row.status,
          extensionsCount: row.extensions_count,
          winnerLabel: row.winner_label,
          finalizedAt: row.finalized_at,
          title: row.title,
        }));
        // resultado (vencedor) e cancelamento: confere o estado completo
        if (row.status === "ended" || row.status === "cancelled") void refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          setConnection("realtime");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          subscribed = false;
          setConnection("polling");
        }
      });
    return () => {
      window.clearTimeout(fallback);
      void supabase.removeChannel(channel);
    };
  }, [id, subscribable, refresh]);

  // consulta: a cada 3 s sem Realtime, a cada 20 s com ele; pausa com a aba escondida
  const over = phase === "ended" && Boolean(item.finalizedAt);
  useEffect(() => {
    if (over || phase === "cancelled" || connection === "connecting") return;
    const every = connection === "realtime" ? SAFETY_MS : POLL_MS;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, every);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connection, over, phase, refresh]);

  // fim do tempo: confere (o servidor pode ter estendido pelo anti-sniping) e grava o resultado
  const endedLocally = phase === "ended" && !item.finalizedAt;
  useEffect(() => {
    if (!endedLocally) return;
    const timer = window.setTimeout(() => void refresh(), 1200);
    return () => window.clearTimeout(timer);
  }, [endedLocally, refresh]);

  // ---------------------------------------------------------------- anúncio acessível (educado, espaçado)
  const lastAnnounce = useRef(0);
  const announceTimer = useRef<number | undefined>(undefined);
  const previousPrice = useRef(item.currentCents);
  const previousStanding = useRef<BidderStanding>(standing);
  useEffect(() => {
    if (previousPrice.current === item.currentCents) return;
    previousPrice.current = item.currentCents;
    const text = t("announce.newPrice", { price: money(item.currentCents, locale) });
    const wait = Math.max(0, lastAnnounce.current + ANNOUNCE_EVERY_MS - Date.now());
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      lastAnnounce.current = Date.now();
      setAnnouncement(text);
    }, wait);
  }, [item.currentCents, locale, t]);
  useEffect(() => () => window.clearTimeout(announceTimer.current), []);

  useEffect(() => {
    if (previousStanding.current === standing) return;
    const before = previousStanding.current;
    previousStanding.current = standing;
    if (standing === "outbid" && before === "winning") toast({ title: t("standing.outbid"), description: t("standing.outbidHint"), variant: "info" });
    if (standing === "won") toast({ title: t("standing.won"), variant: "success" });
  }, [standing, t, toast]);

  // ---------------------------------------------------------------- lance
  const canBid = mode === "consumer" && viewer === "user" && phase === "live" && standing !== "winning";
  const confirmAmount = confirmIncrement !== null ? nextBidAmount(item.currentCents, confirmIncrement) : 0;

  function placeBid() {
    if (confirmIncrement === null) return;
    const increment = confirmIncrement;
    startTransition(async () => {
      const result = await placeBidAction(id, increment);
      if (result.ok) {
        setMine((current) => ({ ...current, bidIds: [...current.bidIds, result.bidId] }));
        setItem((current) => ({
          ...current,
          currentCents: Math.max(current.currentCents, result.amountCents),
          leadingBidId: result.amountCents >= current.currentCents ? result.bidId : current.leadingBidId,
          bidsCount: Math.max(current.bidsCount, result.bidsCount),
          endsAt: result.endsAt,
          status: "live",
        }));
        setBids((current) =>
          current.some((b) => b.id === result.bidId)
            ? current
            : mergeBids(current, [{ id: result.bidId, amountCents: result.amountCents, label: null, createdAt: result.serverNow }]),
        );
        setFreshBidIds(new Set([result.bidId]));
        setConfirmIncrement(null);
        toast({
          title: t("toast.placed", { price: money(result.amountCents, locale) }),
          description: result.extended ? t("toast.extended") : undefined,
          variant: "success",
        });
        // rótulo mascarado do próprio lance vem do servidor
        void refresh();
      } else {
        toast({ title: t(`errors.${result.code}`), variant: "error" });
        if (result.code !== "rate_limited") setConfirmIncrement(null);
        void refresh();
      }
    });
  }

  // ---------------------------------------------------------------- render
  const priceLabel =
    phase === "ended" ? (item.bidsCount > 0 ? t("price.final") : t("price.noBids")) : item.bidsCount > 0 ? t("price.current") : t("price.start");

  return (
    <div className="flex flex-col gap-4" data-testid="auction-room" data-phase={phase} data-connection={connection}>
      <VisuallyHidden>
        <p aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </VisuallyHidden>

      {/* preço e tempo */}
      <section aria-label={t("statusLabel")} className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {phase === "live" ? <LiveBadge label={t("live")} size="md" /> : null}
            {phase === "scheduled" ? <span className="text-xs font-semibold uppercase tracking-wider text-info">{t("phase.scheduled")}</span> : null}
            {phase === "ended" ? <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("phase.ended")}</span> : null}
            {phase === "cancelled" ? <span className="text-xs font-semibold uppercase tracking-wider text-danger">{t("phase.cancelled")}</span> : null}
          </div>
          <ConnectionHint connection={connection} active={phase === "live" || phase === "scheduled"} />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-fg-subtle">{priceLabel}</p>
            <p className="type-numeric break-words text-[1.75rem] font-extrabold leading-tight text-fg min-[400px]:text-4xl sm:text-5xl" data-testid="auction-price">
              <span key={item.currentCents} className={cn(item.currentCents !== initial.item.currentCents && "uh-price-tick")}>
                {money(item.currentCents, locale)}
              </span>
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {t("bidsCount", { n: item.bidsCount })}
              {item.extensionsCount > 0 ? ` · ${t("extendedCount", { n: item.extensionsCount })}` : ""}
            </p>
          </div>
          {phase === "live" || phase === "scheduled" ? (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-fg-subtle">{phase === "live" ? t("endsIn") : t("startsIn")}</p>
              <p
                className={cn("type-numeric text-xl font-bold tabular-nums text-fg min-[400px]:text-2xl sm:text-3xl", urgent && "uh-countdown-urgent")}
                data-testid="auction-countdown"
                suppressHydrationWarning
              >
                {formatCountdown(remaining)}
              </p>
              {urgent ? <p className="text-xs font-semibold text-danger">{t("lastMinute")}</p> : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* situação de quem assiste */}
      {mode === "consumer" ? <StandingBanner standing={standing} phase={phase} item={item} viewer={viewer} locale={locale} /> : null}

      {/* lance rápido */}
      {mode === "consumer" && phase === "live" ? (
        viewer === "user" ? (
          <section aria-label={t("quickBidLabel")} className="flex flex-col gap-2">
            <div className={cn("grid gap-2", item.increments.length <= 2 ? "grid-cols-2" : item.increments.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
              {item.increments.map((inc) => (
                <button
                  key={inc}
                  type="button"
                  disabled={!canBid || pending}
                  onClick={() => setConfirmIncrement(inc)}
                  aria-label={t("quickBidAria", { increment: money(inc, locale, true), total: money(nextBidAmount(item.currentCents, inc), locale) })}
                  className={cn(
                    "uh-btn flex min-h-14 flex-col items-center justify-center rounded-2xl border border-accent/40 bg-accent text-accent-fg shadow-sm transition-[transform,background-color] duration-150",
                    "hover:bg-accent-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  )}
                >
                  <span className="type-numeric text-lg font-extrabold leading-none">+{money(inc, locale, true)}</span>
                  <span className="type-numeric mt-1 text-[0.6875rem] font-medium opacity-80">{money(nextBidAmount(item.currentCents, inc), locale)}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-muted">{standing === "winning" ? t("winningHint") : t("quickBidHint")}</p>
          </section>
        ) : viewer === "anon" ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm text-fg">{t("loginToBid")}</p>
            <Button asChild size="lg" leadingIcon={<LogIn />}>
              <Link href={loginHref}>{t("loginCta")}</Link>
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-fg-muted">
            <Info aria-hidden="true" className="size-4 shrink-0" />
            {t("adminCannotBid")}
          </p>
        )
      ) : null}

      {/* feed de lances */}
      <section aria-labelledby={`feed-${id}`} className="flex flex-col gap-2">
        <h2 id={`feed-${id}`} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Gavel aria-hidden="true" className="size-4" />
          {t("feedTitle")}
        </h2>
        {bids.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-fg-muted">{phase === "scheduled" ? t("feedScheduled") : t("feedEmpty")}</p>
        ) : (
          <ol className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface" data-testid="bid-feed">
            {bids.map((bid, index) => {
              const isMine = myBidIds.has(bid.id);
              return (
                <li
                  key={bid.id}
                  className={cn(
                    "flex min-h-12 items-center gap-3 border-b border-border px-4 py-2 last:border-b-0",
                    freshBidIds.has(bid.id) && "uh-bid-in",
                    index === 0 && "bg-accent-soft/40",
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={cn("truncate text-sm", isMine ? "font-semibold text-accent-text" : "text-fg")}>
                      {isMine ? t("you") : (bid.label ?? t("anonymousBidder"))}
                    </span>
                    {index === 0 ? (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase text-accent-fg">
                        {phase === "ended" ? t("winningBid") : t("topBid")}
                      </span>
                    ) : null}
                  </span>
                  <time dateTime={bid.createdAt} className="type-numeric text-xs text-fg-subtle">
                    {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(bid.createdAt))}
                  </time>
                  <span className="type-numeric w-28 text-right text-sm font-bold text-fg">{money(bid.amountCents, locale)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Sheet
        open={confirmIncrement !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmIncrement(null);
        }}
        title={t("confirm.title")}
        description={t("confirm.description")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmIncrement(null)} disabled={pending}>
              {t("confirm.cancel")}
            </Button>
            <Button size="lg" onClick={placeBid} loading={pending} disabled={!canBid} data-testid="confirm-bid">
              {t("confirm.submit", { price: money(confirmAmount, locale) })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <p className="text-xs uppercase tracking-wider text-fg-subtle">{t("confirm.yourBid")}</p>
          <p className="type-numeric text-4xl font-extrabold text-fg">
            <span key={confirmAmount} className="uh-price-tick">
              {money(confirmAmount, locale)}
            </span>
          </p>
          <p className="text-sm text-fg-muted">
            {t("confirm.breakdown", { current: money(item.currentCents, locale), increment: money(confirmIncrement ?? 0, locale, true) })}
          </p>
          {phase === "live" && remaining < 2 * 60 * 1000 ? <p className="mt-2 text-xs text-warning">{t("confirm.antiSnipe")}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}

function ConnectionHint({ connection, active }: { connection: Connection; active: boolean }) {
  const t = useTranslations("collectibles.room.connection");
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-subtle" data-testid="auction-connection">
      {connection === "realtime" ? <Radio aria-hidden="true" className="size-3" /> : <RefreshCw aria-hidden="true" className="size-3" />}
      {t(connection)}
    </span>
  );
}

function StandingBanner({
  standing,
  phase,
  item,
  viewer,
  locale,
}: {
  standing: BidderStanding;
  phase: string;
  item: CollectibleView;
  viewer: Props["viewer"];
  locale: string;
}) {
  const t = useTranslations("collectibles.room.standing");
  const base = "flex items-start gap-3 rounded-2xl border p-4";

  if (standing === "winning") {
    return (
      <p role="status" data-testid="standing" data-standing="winning" className={cn(base, "border-success/40 bg-success-soft text-fg")}>
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
        <span>
          <strong className="block">{t("winning")}</strong>
          <span className="text-sm text-fg-muted">{t("winningHint")}</span>
        </span>
      </p>
    );
  }
  if (standing === "outbid") {
    return (
      <p role="status" data-testid="standing" data-standing="outbid" className={cn(base, "border-warning/40 bg-warning-soft text-fg")}>
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <span>
          <strong className="block">{t("outbid")}</strong>
          <span className="text-sm text-fg-muted">{t("outbidHint")}</span>
        </span>
      </p>
    );
  }
  if (standing === "won") {
    return (
      <div role="status" data-testid="standing" data-standing="won" className={cn(base, "flex-col border-accent/50 bg-accent-soft text-fg")}>
        <p className="flex items-start gap-3">
          <Trophy aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-accent-text" />
          <span className="flex flex-col gap-1">
            <strong className="block text-lg">{t("won")}</strong>
            <span className="text-sm text-fg-muted">{t("wonFinal")}</span>
            <span className="type-numeric text-2xl font-extrabold text-fg" data-testid="won-price">
              {money(item.currentCents, locale)}
            </span>
            <span className="text-sm text-fg">{t("wonContact")}</span>
          </span>
        </p>
      </div>
    );
  }
  if (phase === "ended") {
    return (
      <p role="status" data-testid="standing" data-standing={standing} className={cn(base, "border-border bg-surface text-fg")}>
        <Gavel aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-muted" />
        <span>
          <strong className="block">{item.bidsCount > 0 ? t("ended") : t("endedNoBids")}</strong>
          {item.bidsCount > 0 ? (
            <span className="text-sm text-fg-muted">
              {item.winnerLabel ? t("endedBy", { name: item.winnerLabel, price: money(item.currentCents, locale) }) : t("endedPrice", { price: money(item.currentCents, locale) })}
            </span>
          ) : null}
        </span>
      </p>
    );
  }
  if (phase === "cancelled") {
    return (
      <p role="status" data-testid="standing" data-standing="cancelled" className={cn(base, "border-danger/40 bg-danger-soft text-fg")}>
        <XCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
        <span>
          <strong className="block">{t("cancelled")}</strong>
          <span className="text-sm text-fg-muted">{t("cancelledHint")}</span>
        </span>
      </p>
    );
  }
  if (phase === "scheduled") {
    return (
      <p role="status" className={cn(base, "border-info/40 bg-info-soft text-fg")}>
        <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
        <span className="text-sm">{viewer === "anon" ? t("scheduledAnon") : t("scheduled")}</span>
      </p>
    );
  }
  return null;
}
