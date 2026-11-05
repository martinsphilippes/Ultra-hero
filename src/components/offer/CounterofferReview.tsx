"use client";

import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { decideCounterofferAction } from "@/lib/offer/actions";
import { openCounteroffer, type Counteroffer } from "@/lib/offer/counteroffer";
import { CounterLine } from "./CounterofferPanel";

// Contraproposta do creator na agência (0079): a aberta com Aceitar/Recusar (valor: só o Adm; data: gestor+) e o
// histórico. Para quem não é Adm o valor não chega (o banco manda null) e a linha diz que é só do Adm.
export function CounterofferReview({ dealId, dealTalentId, counteroffers, canDecideFee, canDecideDate }: { dealId: string; dealTalentId: string; counteroffers: Counteroffer[]; canDecideFee: boolean; canDecideDate: boolean }) {
  const t = useTranslations("offer.review");
  const locale = useLocale() as Locale;
  const [deciding, setDeciding] = useState<"accepted" | "rejected" | null>(null);
  const open = openCounteroffer(counteroffers);
  const earlier = counteroffers.filter((c) => c !== open);
  if (counteroffers.length === 0) return null;
  const canDecide = open ? (open.kind === "fee" ? canDecideFee : canDecideDate) : false;

  return (
    <div className="flex flex-col gap-2" data-testid="counteroffer-review">
      {open ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft/30 px-3 py-2">
          <span className="text-xs font-semibold text-fg">{t("title")}</span>
          <CounterLine c={open} locale={locale} feeHidden={t("feeHidden")} feeInApp />
          {canDecide ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" leadingIcon={<Check />} onClick={() => setDeciding("accepted")} data-testid="counter-accept">
                {t("accept")}
              </Button>
              <Button type="button" size="sm" variant="secondary" leadingIcon={<X />} onClick={() => setDeciding("rejected")} data-testid="counter-reject">
                {t("reject")}
              </Button>
            </div>
          ) : (
            <span className="type-caption text-fg-muted">{open.kind === "fee" ? t("onlyAdmin") : t("onlyManager")}</span>
          )}
        </div>
      ) : null}
      {earlier.length > 0 ? (
        <details>
          <summary className="cursor-pointer type-caption text-fg-muted">{t("earlier", { count: earlier.length })}</summary>
          <ul className="mt-1 flex flex-col gap-1.5">
            {earlier.map((c) => (
              <li key={c.id}>
                <CounterLine c={c} locale={locale} feeHidden={t("feeHidden")} feeInApp />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {open && deciding ? <DecideDialog dealId={dealId} dealTalentId={dealTalentId} counteroffer={open} decision={deciding} onClose={() => setDeciding(null)} /> : null}
    </div>
  );
}

function DecideDialog({ dealId, dealTalentId, counteroffer, decision, onClose }: { dealId: string; dealTalentId: string; counteroffer: Counteroffer; decision: "accepted" | "rejected"; onClose: () => void }) {
  const t = useTranslations("offer.review");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hint = decision === "rejected" ? undefined : counteroffer.kind === "fee" ? t("acceptFeeHint") : counteroffer.deliverableId ? t("acceptDateHint") : t("acceptDateGeneral");
  function run() {
    setError(null);
    if (decision === "rejected" && note.trim().length < 3) return setError(t("noteRequired"));
    start(async () => {
      const result = await decideCounterofferAction({ counterofferId: counteroffer.id, dealId, dealTalentId, decision, note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={decision === "accepted" ? t("acceptTitle") : t("rejectTitle")}
      description={hint}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" onClick={run} loading={pending} data-testid="counter-decide-run">
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={decision === "rejected" ? t("note") : t("noteOptional")} required={decision === "rejected"}>
          <Textarea value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
