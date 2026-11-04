import { Bell, MessagesSquare, Search, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { InboxPage } from "@/components/inbox/InboxPage";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { unreadInboxCount } from "@/lib/inbox/queries";
import {
  MAX_LIMIT,
  PAGE_SIZE,
  kindLabelKey,
  messagesHref,
  noticesHref,
  parseMessagesQuery,
  resolveTab,
  type ConversationKind,
  type MessagingPortal,
} from "@/lib/messaging/logic";
import { listConversations, unreadConversations } from "@/lib/messaging/queries";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";

type Params = Record<string, string | string[] | undefined>;
type Props = { portal: MessagingPortal; basePath: string; searchParams: Params };

// Tipos que existem em cada portal (o staff externo só tem salas: sem filtro de tipo).
const PORTAL_KINDS: Record<MessagingPortal, ConversationKind[]> = {
  agency: ["campaign", "opportunity", "room"],
  brand: ["campaign", "room"],
  hero: ["opportunity", "room"],
  staff: [],
};

// "Avisos e mensagens" (0115): a mesma rota de avisos de cada portal ganha duas abas no topo — Mensagens (todas as
// conversas, com contexto e etapa) e Avisos (o sino de sempre) — cada uma com a contagem de não lidas.
export async function InboxHub({ portal, basePath, searchParams }: Props) {
  const tab = resolveTab(searchParams);
  const q = parseMessagesQuery(searchParams);
  const [t, inboxUnread, page, convUnreadOnly] = await Promise.all([
    getTranslations("messaging"),
    unreadInboxCount(),
    tab === "messages" ? listConversations(portal, { limit: q.limit, kind: q.kind, unread: q.unread, q: q.q }) : Promise.resolve(null),
    tab === "notices" ? unreadConversations(portal) : Promise.resolve(null),
  ]);
  const convUnread = page ? page.unread.total : (convUnreadOnly ?? 0);

  const tabs = [
    { key: "messages" as const, href: messagesHref(basePath, {}), label: t("tabMessages"), icon: MessagesSquare, unread: convUnread },
    { key: "notices" as const, href: noticesHref(basePath), label: t("tabNotices"), icon: Bell, unread: inboxUnread ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("tabsLabel")} className="grid grid-cols-2 gap-2" data-testid="inbox-hub-tabs">
        {tabs.map((x) => {
          const active = tab === x.key;
          const Icon = x.icon;
          return (
            <a
              key={x.key}
              href={x.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                active ? "border-fg bg-fg text-bg" : "border-border-strong bg-surface text-fg hover:bg-surface-hover",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{x.label}</span>
              {x.unread > 0 ? (
                <span
                  className={cn("flex min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-[22px]", active ? "bg-bg text-fg" : "bg-accent text-white")}
                  aria-label={t("tabUnread", { count: x.unread })}
                >
                  {x.unread > 99 ? "99+" : x.unread}
                </span>
              ) : null}
            </a>
          );
        })}
      </nav>
      {tab === "notices" ? (
        <InboxPage basePath={basePath} unreadOnly={(Array.isArray(searchParams.filtro) ? searchParams.filtro[0] : searchParams.filtro) === "nao-lidas"} embedded />
      ) : (
        <MessagesTab portal={portal} basePath={basePath} q={q} page={page} />
      )}
    </div>
  );
}

async function MessagesTab({
  portal,
  basePath,
  q,
  page,
}: {
  portal: MessagingPortal;
  basePath: string;
  q: ReturnType<typeof parseMessagesQuery>;
  page: Awaited<ReturnType<typeof listConversations>> | null;
}) {
  const t = await getTranslations("messaging");
  const kinds = PORTAL_KINDS[portal];
  const filtered = Boolean(q.kind || q.unread || q.q);
  const items = page?.items ?? [];
  const now = new Date();
  return (
    <section aria-label={t("tabMessages")} className="flex flex-col gap-4" data-testid="messages-tab">
      <div className="flex flex-col gap-3">
        <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
          <FilterAnchor href={messagesHref(basePath, { kind: q.kind, q: q.q })} active={!q.unread} label={t("filterAll")} />
          <FilterAnchor href={messagesHref(basePath, { kind: q.kind, q: q.q, unread: true })} active={q.unread} label={t("filterUnread", { count: page?.unread.total ?? 0 })} />
        </nav>
        {kinds.length > 1 ? (
          <nav aria-label={t("kindFilterLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <FilterAnchor href={messagesHref(basePath, { unread: q.unread, q: q.q })} active={!q.kind} label={t("kindAll")} />
            {kinds.map((k) => (
              <FilterAnchor
                key={k}
                href={messagesHref(basePath, { kind: k, unread: q.unread, q: q.q })}
                active={q.kind === k}
                label={`${t(`kindsPlural.${kindLabelKey(portal, k)}`)} (${page?.kinds[k] ?? 0})`}
              />
            ))}
          </nav>
        ) : null}
        <form action={basePath} method="get" role="search" className="flex items-center gap-2">
          <input type="hidden" name="aba" value="mensagens" />
          {q.kind ? <input type="hidden" name="tipo" value={{ campaign: "campanha", opportunity: "oportunidade", room: "sala" }[q.kind]} /> : null}
          {q.unread ? <input type="hidden" name="filtro" value="nao-lidas" /> : null}
          <label className="sr-only" htmlFor="conversation-search">
            {t("searchLabel")}
          </label>
          <input
            id="conversation-search"
            type="search"
            name="q"
            defaultValue={q.q}
            maxLength={80}
            placeholder={t("searchPlaceholder")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:text-sm"
          />
          <Button type="submit" variant="secondary" size="md" leadingIcon={<Search />} className="min-h-11">
            {t("searchSubmit")}
          </Button>
          {q.q ? (
            <a href={messagesHref(basePath, { kind: q.kind, unread: q.unread })} aria-label={t("searchClear")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg">
              <X className="size-4" aria-hidden="true" />
            </a>
          ) : null}
        </form>
      </div>
      {page && !page.available ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("unavailable")}</p>
      ) : items.length > 0 ? (
        <>
          <ConversationList portal={portal} items={items} now={now} />
          <div className="flex flex-col items-center gap-2">
            {!filtered && page && page.total > items.length ? <p className="type-caption text-fg-muted">{t("showing", { shown: items.length, total: page.total })}</p> : null}
            {page?.hasMore && q.limit < MAX_LIMIT ? (
              <Button asChild variant="secondary" size="lg">
                <a href={messagesHref(basePath, { ...q, limit: q.limit + PAGE_SIZE })} data-testid="conversation-load-more">
                  {t("loadMore")}
                </a>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<MessagesSquare />}
            title={filtered ? t("emptyFiltered") : t("emptyTitle")}
            description={t(`emptyHint.${portal}`)}
            action={
              filtered ? (
                <Button asChild variant="secondary">
                  <a href={messagesHref(basePath, {})}>{t("clearFilters")}</a>
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </section>
  );
}
