"use client";

import { Gavel, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonBase, buttonSizes, buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import {
  collectibleHref,
  isOnItemPage,
  OUTBID_POLL_MS,
  OUTBID_SAFETY_POLL_MS,
  outbidAlertText,
  parseOutbidAlert,
  pickOutbidPopup,
  type OutbidAlert,
  type OutbidItemState,
} from "@/lib/collectibles/outbid";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Client = ReturnType<typeof createClient>;

// Pop-up "Seu lance em <item> foi superado" em qualquer tela (0061; docs/decisions/colecionaveis.md).
// Lê os próprios avisos (user_alerts, RLS) pelo Realtime, com consulta de reserva a cada 20 s só com a
// aba visível. Cada aviso aparece uma vez: ao aparecer vira "visto" no banco (outra aba não repete).
// Na página do próprio item não aparece (lá já existe o aviso "Seu lance foi superado"). Não rouba o
// foco, fecha no X ou com Esc e respeita a preferência por menos movimento. Banco sem a 0061: para.
export function OutbidAlerts({ userId }: { userId: string }) {
  const t = useTranslations("collectibles.alert");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [alert, setAlert] = useState<OutbidAlert | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const clientRef = useRef<Client | null>(null);
  const busy = useRef(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const client = useCallback((): Client | null => {
    if (clientRef.current) return clientRef.current;
    try {
      clientRef.current = createClient();
    } catch {
      return null;
    }
    return clientRef.current;
  }, []);

  const markSeen = useCallback(
    async (ids: string[]) => {
      const supabase = client();
      if (!supabase || ids.length === 0) return;
      await supabase.from("user_alerts").update({ seen_at: new Date().toISOString() }).in("id", ids).is("seen_at", null);
    },
    [client],
  );

  const refresh = useCallback(async () => {
    const supabase = client();
    if (!supabase || busy.current) return;
    busy.current = true;
    try {
      const { data, error } = await supabase
        .from("user_alerts")
        .select("id, kind, collectible_id, title, amount_cents, updated_at")
        .eq("kind", "auction_outbid")
        .is("seen_at", null)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) {
        // tabela ausente (banco sem a 0061): não insiste
        if (error.code === "PGRST205" || error.code === "42P01") setDisabled(true);
        return;
      }
      const alerts = (data ?? []).map(parseOutbidAlert).filter((a): a is OutbidAlert => a !== null);
      if (alerts.length === 0) return;
      const { data: rows } = await supabase
        .from("collectibles")
        .select("id, status, starts_at, ends_at")
        .in("id", [...new Set(alerts.map((a) => a.collectibleId))]);
      const items = new Map<string, OutbidItemState>((rows ?? []).map((r) => [r.id, { status: r.status, startsAt: r.starts_at, endsAt: r.ends_at }]));
      const { show, silent } = pickOutbidPopup(alerts, { pathname: pathRef.current, nowMs: Date.now(), items });
      const seen = show ? [...silent, show.id] : silent;
      if (show) setAlert(show);
      await markSeen(seen);
    } catch {
      // rede instável: a próxima rodada tenta de novo
    } finally {
      busy.current = false;
    }
  }, [client, markSeen]);

  // Realtime: qualquer aviso novo ou atualizado da pessoa dispara a leitura (a RLS filtra no servidor)
  useEffect(() => {
    if (disabled) return;
    const supabase = client();
    if (!supabase) return;
    void refresh();
    const channel = supabase
      .channel(`user-alerts-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_alerts", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime(true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime(false);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, disabled, refresh, userId]);

  // reserva: 20 s sem Realtime, 60 s com ele; só com a aba visível
  useEffect(() => {
    if (disabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, realtime ? OUTBID_SAFETY_POLL_MS : OUTBID_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [disabled, realtime, refresh]);

  // foi para a página do item: o aviso de lá basta
  const current = alert && isOnItemPage(pathname, alert.collectibleId) ? null : alert;

  const close = useCallback(() => setAlert(null), []);
  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, close]);

  if (!current) return null;
  const text = outbidAlertText(current, locale);
  return (
    <section
      aria-label={t("region")}
      className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-50 flex justify-center md:inset-x-auto md:right-6 md:justify-end"
    >
      <div
        role="status"
        aria-live="polite"
        data-testid="outbid-alert"
        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-warning/40 bg-surface-elevated p-3.5 text-fg shadow-lg animate-slide-up motion-reduce:animate-none"
      >
        <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
          <Gavel className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">{t("title", { item: text.item })}</p>
            <p className="type-body-sm text-fg-muted">{t("price", { price: text.price })}</p>
          </div>
          <Link
            href={collectibleHref(current.collectibleId)}
            onClick={close}
            data-testid="outbid-alert-cta"
            className={cn(buttonBase, buttonVariants.primary, buttonSizes.md, "w-fit")}
          >
            {t("cta")}
          </Link>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="-mr-1.5 -mt-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
