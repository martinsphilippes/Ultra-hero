"use client";

import { Handshake, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import { respondSponsorshipAction } from "@/lib/sponsorship/actions";
import type { SponsorshipResponse } from "@/lib/sponsorship/vocab";

type Props = { id: string; canInterest: boolean; canDecline: boolean };

// Resposta da marca (0085): "Quero patrocinar" (com mensagem opcional) cria a campanha em rascunho e leva até ela
// (dali segue o fluxo normal: a equipe pede aprovação ao dono, o dono envia à agência); "Não tenho interesse".
export function SponsorshipRespond({ id, canInterest, canDecline }: Props) {
  const t = useTranslations("sponsorship.brand");
  const router = useRouter();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(response: SponsorshipResponse) {
    setError(null);
    start(async () => {
      const result = await respondSponsorshipAction({ id, response, message });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      if (response === "interested" && result.requestId) router.push(`/marca/campanhas/${result.requestId}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="sponsorship-respond">
      {canInterest ? (
        <FormField label={t("messageLabel")} hint={t("messageHint")}>
          <Textarea value={message} maxLength={500} rows={2} onChange={(e) => setMessage(e.target.value)} disabled={pending} />
        </FormField>
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {canInterest ? (
          <Button type="button" size="lg" leadingIcon={<Handshake />} onClick={() => send("interested")} disabled={pending} data-testid="sponsorship-interest">
            {t("interest")}
          </Button>
        ) : null}
        {canDecline ? (
          <Button type="button" size="lg" variant="secondary" leadingIcon={<ThumbsDown />} onClick={() => send("declined")} disabled={pending} data-testid="sponsorship-decline">
            {t("decline")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
