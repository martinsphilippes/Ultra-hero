"use client";

import { MessageCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { respondOpportunityAction } from "@/app/creator/escritorio/actions";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import type { TalentResponse } from "@/lib/deals/vocab";

// Resposta do creator à oportunidade: tenho interesse, quero conversar, não tenho interesse (com motivo).
// Nada aqui é vínculo contratual: a confirmação comercial é da agência, com a marca.
export function OpportunityRespond({ dealTalentId, status }: { dealTalentId: string; status: string }) {
  const t = useTranslations("talent.opportunities.respond");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<TalentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!["consulted", "talk_requested"].includes(status)) return null;

  function send(response: TalentResponse) {
    setError(null);
    setChoice(response);
    if (response === "declined" && note.trim().length < 3) return setError(t("reasonRequired"));
    start(async () => {
      const result = await respondOpportunityAction({ dealTalentId, response, note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/30 p-4" aria-labelledby="opp-respond" data-testid="opportunity-respond">
      <h2 id="opp-respond" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      <FormField label={t("note")} hint={t("noteHint")} error={error}>
        <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="button" leadingIcon={<ThumbsUp />} onClick={() => send("interested")} loading={pending && choice === "interested"} disabled={pending} data-testid="respond-interested">
          {t("interested")}
        </Button>
        {status !== "talk_requested" ? (
          <Button type="button" variant="secondary" leadingIcon={<MessageCircle />} onClick={() => send("talk_requested")} loading={pending && choice === "talk_requested"} disabled={pending}>
            {t("talk")}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" leadingIcon={<ThumbsDown />} onClick={() => send("declined")} loading={pending && choice === "declined"} disabled={pending} data-testid="respond-declined">
          {t("declined")}
        </Button>
      </div>
      <p className="type-caption text-fg-muted">{t("legal")}</p>
    </section>
  );
}
