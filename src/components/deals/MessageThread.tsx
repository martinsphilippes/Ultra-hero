"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { postDealMessageAction, type DealPortal } from "@/lib/deals/actions";
import type { MessageRow } from "@/lib/deals/queries";
import { cn } from "@/lib/utils";

type Props = {
  portal: DealPortal;
  dealId: string;
  channel: "brand_agency" | "talent_agency";
  talentId: string | null;
  messages: MessageRow[];
  /** Lado de quem está lendo: as mensagens dele ficam à direita. */
  mySide: "agency" | "brand" | "talent";
  canPost: boolean;
  revalidate: string;
  lockedNote?: string | null;
};

// Conversa de um canal do negócio. Só texto; valores nunca passam por aqui (D16: a mensagem é texto livre,
// mas a tela não oferece campo de valor e o cachê tem lugar próprio).
export function MessageThread({ portal, dealId, channel, talentId, messages, mySide, canPost, revalidate, lockedNote }: Props) {
  const t = useTranslations("commercial.messages");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (body.trim().length === 0) return setError(t("required"));
    start(async () => {
      const result = await postDealMessageAction(portal, { dealId, channel, talentId, body: body.trim(), revalidate });
      if (!result.ok) return setError(result.error);
      setBody("");
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid={`thread-${channel}`}>
      {messages.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label={t("listLabel")}>
          {messages.map((m) => {
            const mine = m.authorSide === mySide;
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("flex max-w-[85%] flex-col gap-1 rounded-2xl border px-3 py-2", mine ? "border-accent/30 bg-accent-soft" : "border-border bg-surface")}>
                  <span className="type-caption text-fg-muted">
                    {m.authorLabel} · {formatDateTime(m.createdAt, locale)}
                  </span>
                  <p className="whitespace-pre-wrap text-sm text-fg">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {lockedNote ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{lockedNote}</p>
      ) : canPost ? (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <FormField label={t("newMessage")} error={error}>
            <Textarea value={body} maxLength={4000} rows={3} onChange={(e) => setBody(e.target.value)} disabled={pending} placeholder={t("placeholder")} />
          </FormField>
          <Button type="submit" size="sm" leadingIcon={<Send />} loading={pending} className="w-fit" data-testid="message-send">
            {t("send")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
