"use client";

import { Bell, CheckCheck, ChevronRight, MessagesSquare } from "lucide-react";
import { playChime } from "@/lib/sound/chime";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Sheet, Spinner } from "@/components/ui";
import { listInboxAction, markReadAction } from "@/lib/inbox/actions";
import type { InboxItem } from "@/lib/inbox/queries";
import { conversationUnreadAction } from "@/lib/messaging/actions";
import type { MessagingPortal } from "@/lib/messaging/logic";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { InboxItemView } from "./InboxItemView";

type Props = {
  userId: string;
  initialUnread: number;
  allHref: string;
  /**
   * "Avisos e mensagens" (0115): o sino soma as conversas não lidas do portal e o painel abre com um atalho para a aba
   * Mensagens. Decisão: um ícone só no topo (o cabeçalho do celular já tem menu, tema, idioma e conta; um segundo
   * ícone de 44 px apertaria o título) — o número é a soma e o nome acessível diz quantos são avisos e quantas conversas.
   */
  messages?: { portal: MessagingPortal; href: string; initialUnread: number };
};

/** Evento de janela com o tipo de cada aviso novo (as telas que precisam se atualizam sozinhas). */
export const INBOX_EVENT = "uh:inbox";
const POLL_MS = 30_000;

// Sino dos portais de gestão: contagem de não lidos em tempo real (Realtime + consulta de reserva a cada
// 30 s com a aba visível), lista dos 20 últimos num painel lateral e "marcar todas como lidas".
export function NotificationBell({ userId, initialUnread, allHref, messages }: Props) {
  const t = useTranslations("inbox");
  const tm = useTranslations("messaging");
  const [unread, setUnread] = useState(initialUnread);
  const [msgUnread, setMsgUnread] = useState(messages?.initialUnread ?? 0);
  const portal = messages?.portal ?? null;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);

  const refreshMessages = useCallback(async () => {
    if (!portal) return;
    try {
      const n = await conversationUnreadAction(portal);
      if (typeof n === "number") setMsgUnread(n);
    } catch {
      // rede instável: a próxima rodada tenta de novo
    }
  }, [portal]);

  const load = useCallback(async () => {
    setLoading(true);
    void refreshMessages();
    try {
      const page = await listInboxAction({ limit: 20 });
      setItems(page.items);
      setUnread(page.unread);
    } finally {
      setLoading(false);
    }
  }, [refreshMessages]);

  const refreshCount = useCallback(async () => {
    void refreshMessages();
    try {
      const page = await listInboxAction({ limit: 1 });
      setUnread(page.unread);
    } catch {
      // rede instável: a próxima rodada tenta de novo
    }
  }, [refreshMessages]);

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
        // 0128: som de aviso próprio do Ultra (assobio curto)
        playChime();
        const kind = (payload.new as { kind?: string } | null)?.kind;
        // aviso de mensagem nova: a conversa também mudou
        if (kind === "message_received") void refreshMessages();
        if (kind) window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: { kind } }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime(true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime(false);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshMessages]);

  // conversas não lidas: o layout não espera a contagem (ela percorre as conversas); o sino busca ao montar
  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

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

  const total = unread + (messages ? msgUnread : 0);
  const label = messages ? tm("bellLabel", { notices: unread, messages: msgUnread }) : unread > 0 ? t("bellUnread", { count: unread }) : t("bell");
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
        {total > 0 ? (
          <span
            aria-hidden="true"
            className={cn("absolute right-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-[18px] text-white")}
            data-testid="notification-count"
          >
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={messages ? tm("title") : t("title")}
        description={t("sheetDescription")}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <a href={allHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
              {messages ? tm("seeNotices") : t("seeAll")}
            </a>
            <Button type="button" variant="secondary" size="sm" leadingIcon={<CheckCheck />} onClick={markAll} disabled={unread === 0}>
              {t("markAll")}
            </Button>
          </div>
        }
      >
        {messages ? (
          <a
            href={messages.href}
            className="mb-3 flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="bell-messages-link"
          >
            <MessagesSquare className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-fg">{tm("bellMessages")}</span>
              <span className="type-caption text-fg-muted">{tm("bellMessagesHint", { count: msgUnread })}</span>
            </span>
            {msgUnread > 0 ? (
              <span aria-hidden="true" className="flex min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-[22px] text-white">
                {msgUnread > 99 ? "99+" : msgUnread}
              </span>
            ) : null}
            <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          </a>
        ) : null}
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
