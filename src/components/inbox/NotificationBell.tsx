"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Sheet, Spinner } from "@/components/ui";
import { listInboxAction, markReadAction } from "@/lib/inbox/actions";
import type { InboxItem } from "@/lib/inbox/queries";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { InboxItemView } from "./InboxItemView";

type Props = { userId: string; initialUnread: number; allHref: string };

/** Evento de janela com o tipo de cada aviso novo (as telas que precisam se atualizam sozinhas). */
export const INBOX_EVENT = "uh:inbox";
const POLL_MS = 30_000;

// Sino dos portais de gestão: contagem de não lidos em tempo real (Realtime + consulta de reserva a cada
// 30 s com a aba visível), lista dos 20 últimos num painel lateral e "marcar todas como lidas".
export function NotificationBell({ userId, initialUnread, allHref }: Props) {
  const t = useTranslations("inbox");
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listInboxAction({ limit: 20 });
      setItems(page.items);
      setUnread(page.unread);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      const page = await listInboxAction({ limit: 1 });
      setUnread(page.unread);
    } catch {
      // rede instável: a próxima rodada tenta de novo
    }
  }, []);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = clientRef.current ?? createClient();
      clientRef.current = supabase;
    } catch {
      return;
    }
    const channel = supabase
      .channel(`inbox-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbox_notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        setUnread((n) => n + 1);
        const kind = (payload.new as { kind?: string } | null)?.kind;
        if (kind) window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: { kind } }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime(true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime(false);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, realtime ? POLL_MS * 2 : POLL_MS);
    return () => window.clearInterval(timer);
  }, [realtime, refreshCount]);

  async function markAll() {
    const result = await markReadAction({});
    if (result.ok) {
      setUnread(0);
      setItems((list) => list?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null);
    }
  }

  const label = unread > 0 ? t("bellUnread", { count: unread }) : t("bell");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        aria-label={label}
        className="relative inline-flex size-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        data-testid="notification-bell"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className={cn("absolute right-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-[18px] text-white")}
            data-testid="notification-count"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("sheetDescription")}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <a href={allHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
              {t("seeAll")}
            </a>
            <Button type="button" variant="secondary" size="sm" leadingIcon={<CheckCheck />} onClick={markAll} disabled={unread === 0}>
              {t("markAll")}
            </Button>
          </div>
        }
      >
        {loading && !items ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : items && items.length > 0 ? (
          <ul className="flex flex-col gap-1" aria-label={t("listLabel")}>
            {items.map((item) => (
              <li key={item.id}>
                <InboxItemView item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center type-body-sm text-fg-muted">{t("empty")}</p>
        )}
      </Sheet>
    </>
  );
}
