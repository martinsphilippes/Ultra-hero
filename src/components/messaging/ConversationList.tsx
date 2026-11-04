import { Lock, Megaphone, Paperclip, Sparkles, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Avatar, Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatRelativeTime } from "@/i18n/format";
import { conversationHref, kindLabelKey, stageChip, type Conversation, type MessagingPortal, type StageChip } from "@/lib/messaging/logic";
import { cn } from "@/lib/utils";

type Props = { portal: MessagingPortal; items: Conversation[]; now: Date };

const KIND_ICON = { campaign: Megaphone, hero: Sparkles, opportunity: Sparkles, room: Users } as const;

// Lista única de conversas (0115): cada linha diz com quem, sobre o quê (tipo + campanha/projeto), em que etapa, a
// última mensagem e quantas novas. A linha inteira é um link (≥ 72 px de altura) para a conversa na página que já existe.
export async function ConversationList({ portal, items, now }: Props) {
  const [t, tc, locale] = await Promise.all([getTranslations("messaging"), getTranslations("commercial"), getLocale() as Promise<Locale>]);

  function stageText(chip: StageChip | null): string {
    if (!chip) return t("noStage");
    switch (chip.group) {
      case "stages":
        return tc(`stages.${chip.value}`);
      case "brandStatus":
        return tc(`brandStatus.${chip.value}`);
      case "talentStatus":
        return tc(`talentStatus.${chip.value}`);
      case "outcomes":
        return t("closed", { outcome: tc(`outcomes.${chip.value}`) });
      case "room":
        return t(`room.${chip.value}`);
    }
  }

  function preview(c: Conversation): string {
    if (c.locked) return t("locked");
    if (!c.lastBody && !c.lastAttachment) return t("noMessages");
    const body = c.lastBody?.trim() ? c.lastBody : t("attachment");
    return c.lastAuthor ? `${c.lastAuthor}: ${body}` : body;
  }

  return (
    <ul role="list" aria-label={t("listLabel")} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2" data-testid="conversation-list">
      {items.map((c) => {
        const href = conversationHref(portal, c);
        const kindKey = kindLabelKey(portal, c.kind);
        const KindIcon = c.locked ? Lock : KIND_ICON[kindKey];
        const chip = stageChip(portal, c);
        const stage = stageText(chip);
        const when = formatRelativeTime(c.lastAt, locale, now);
        const name = c.counterpart || c.title;
        const label = t("rowLabel", { kind: t(`kinds.${kindKey}`), name, title: c.title, stage, unread: c.unread, when });
        const unread = c.unread > 0;
        const body = (
          <>
            <Avatar src={c.avatarUrl} name={name} size="md" alt="" className="mt-0.5" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-fg", unread ? "font-bold" : "font-semibold")}>{name}</span>
                <time dateTime={c.lastAt} className={cn("shrink-0 type-caption", unread ? "font-semibold text-accent-text" : "text-fg-muted")}>
                  {when}
                </time>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge size="sm" variant="accent" icon={<KindIcon aria-hidden="true" />} className="shrink-0">
                  {t(`kinds.${kindKey}`)}
                </Badge>
                <span className="truncate text-sm text-fg">{c.title}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Badge size="sm" variant={chip?.tone ?? "neutral"} className="shrink-0" data-testid="conversation-stage">
                  {stage}
                </Badge>
                <p className={cn("min-w-0 flex-1 truncate type-body-sm", unread ? "text-fg" : "text-fg-muted")}>
                  {c.lastAttachment && !c.locked ? <Paperclip className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" /> : null}
                  {preview(c)}
                </p>
                {unread ? (
                  <span aria-hidden="true" className="flex min-w-[22px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-[22px] text-white" data-testid="conversation-unread">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                ) : null}
              </div>
            </div>
          </>
        );
        const row = "flex min-h-[72px] items-start gap-3 rounded-xl px-3 py-2.5";
        return (
          <li key={c.key} className={cn(unread && "bg-accent-soft/40 rounded-xl")}>
            {href ? (
              <Link
                href={href}
                prefetch={false}
                aria-label={label}
                className={cn(row, "transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus")}
                data-testid="conversation-row"
              >
                {body}
              </Link>
            ) : (
              <div aria-label={label} role="group" className={row}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
