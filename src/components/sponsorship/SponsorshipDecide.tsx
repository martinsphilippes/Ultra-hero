"use client";

import { Ban, CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Checkbox, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import { decideSponsorshipAction } from "@/lib/sponsorship/actions";
import type { SponsorshipDecision } from "@/lib/sponsorship/vocab";

type Props = { id: string; interested: { brandId: string; name: string }[]; /** 0088: marcas com acordo (sempre vencedoras) */ agreed?: string[] };

// Decisão da agência (0085): marca(s) vencedora(s) entre as que quiseram → patrocinada; ou encerrar sem patrocínio;
// ou cancelar. Encerrar e cancelar pedem confirmação. As marcas que responderam e o creator são avisados.
export function SponsorshipDecide({ id, interested, agreed = [] }: Props) {
  const t = useTranslations("sponsorship.agency.decide");
  const router = useRouter();
  const { toast } = useToast();
  const [winners, setWinners] = useState<string[]>(interested.length === 1 ? Array.from(new Set([interested[0].brandId, ...agreed])) : agreed);
  const hasAgreement = agreed.length > 0;
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<Exclude<SponsorshipDecision, "sponsor"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: SponsorshipDecision) {
    setError(null);
    if (action === "sponsor" && winners.length === 0) return setError(t("pickOne"));
    start(async () => {
      const result = await decideSponsorshipAction({ id, action, brandIds: action === "sponsor" ? winners : [], note });
      setConfirm(null);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="sponsorship-decide" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="sponsorship-decide">
      <div className="flex flex-col gap-1">
        <h2 id="sponsorship-decide" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      </div>
      {interested.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("noInterested")}</p>
      ) : (
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-sm font-medium text-fg">{t("winners")}</legend>
          {interested.map((b) => (
            <Checkbox
              key={b.brandId}
              label={b.name}
              checked={winners.includes(b.brandId) || agreed.includes(b.brandId)}
              onChange={(e) => setWinners((cur) => (e.target.checked ? Array.from(new Set([...cur, b.brandId])) : cur.filter((x) => x !== b.brandId)))}
              disabled={pending || agreed.includes(b.brandId)}
            />
          ))}
          {hasAgreement ? <p className="type-caption text-fg-muted">{t("agreedLocked")}</p> : null}
        </fieldset>
      )}
      <FormField label={t("note")}>
        <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" size="lg" leadingIcon={<CheckCircle2 />} onClick={() => run("sponsor")} disabled={pending || interested.length === 0} data-testid="sponsorship-sponsor">
          {t("sponsor")}
        </Button>
        <Button type="button" size="lg" variant="secondary" leadingIcon={<XCircle />} onClick={() => setConfirm("close")} disabled={pending || hasAgreement}>
          {t("close")}
        </Button>
        <Button type="button" size="lg" variant="ghost" leadingIcon={<Ban />} onClick={() => setConfirm("cancel")} disabled={pending || hasAgreement}>
          {t("cancel")}
        </Button>
      </div>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm === "cancel" ? t("confirmCancelTitle") : t("confirmCloseTitle")}
        description={confirm === "cancel" ? t("confirmCancel") : t("confirmClose")}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant={confirm === "cancel" ? "danger" : "primary"} onClick={() => confirm && run(confirm)} disabled={pending}>
              {confirm === "cancel" ? t("cancel") : t("close")}
            </Button>
          </div>
        }
      />
    </section>
  );
}
