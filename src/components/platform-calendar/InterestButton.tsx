"use client";

import { Heart, HeartOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { setInterestAction } from "@/lib/platform-calendar/actions";

type Props = {
  eventId: string;
  party: "hero" | "brand";
  ownerId: string;
  /** Estado atual: sem linha = "none". */
  state: "none" | "interested" | "withdrawn";
  /** Evento cancelado ou encerrado: não aceita interesse novo (retirar continua possível). */
  closed: boolean;
  /** 0101: versão curta para os cartões da Real-Time Culture (só o botão, sem o texto de estado). */
  compact?: boolean;
};

// "Tenho interesse" / "Retirar interesse" (0098). Interesse é só um sinal para a agência e a Groscove: não vira
// proposta, negócio nem contrato. O banco confere quem pode (titular do Hero ativo; dono/equipe da marca).
export function InterestButton({ eventId, party, ownerId, state: initial, closed, compact = false }: Props) {
  const t = useTranslations("groscoveCalendar.interest");
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const interested = state === "interested";

  function toggle() {
    start(async () => {
      const result = await setInterestAction({ eventId, party, ownerId, interested: !interested });
      if (result.ok) setState(result.state === "interested" ? "interested" : result.state === "withdrawn" ? "withdrawn" : "none");
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  if (compact) {
    if (closed && !interested) return null;
    return (
      <Button
        type="button"
        size="sm"
        variant={interested ? "secondary" : "primary"}
        leadingIcon={interested ? <HeartOff /> : <Heart />}
        onClick={toggle}
        disabled={pending}
        aria-pressed={interested}
        data-testid="interest-compact"
        data-state={state}
      >
        {interested ? t("withdraw") : t("add")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="interest-panel" data-state={state}>
      <p className="type-body-sm text-fg" aria-live="polite">
        {interested ? t("stateInterested") : state === "withdrawn" ? t("stateWithdrawn") : t("stateNone")}
      </p>
      {interested ? (
        <Button type="button" size="lg" variant="secondary" leadingIcon={<HeartOff />} onClick={toggle} disabled={pending} className="w-full sm:w-fit" data-testid="interest-withdraw">
          {t("withdraw")}
        </Button>
      ) : closed ? (
        <p className="type-caption text-fg-muted">{t("closed")}</p>
      ) : (
        <Button type="button" size="lg" leadingIcon={<Heart />} onClick={toggle} disabled={pending} className="w-full sm:w-fit" data-testid="interest-add">
          {t("add")}
        </Button>
      )}
    </div>
  );
}
