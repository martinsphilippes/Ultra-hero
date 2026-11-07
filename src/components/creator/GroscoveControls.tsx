"use client";

import { Ban, Waves } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Textarea } from "@/components/ui";
import { setOndaAction, takedownContentAction } from "@/lib/content-level/actions";

/** Só para a Groscove: põe ou tira a página do Hero da Onda. */
export function OndaToggle({ creatorId, on }: { creatorId: string; on: boolean }) {
  const t = useTranslations("contentLevel.groscove");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "primary" : "secondary"}
      leadingIcon={<Waves />}
      loading={pending}
      aria-pressed={on}
      onClick={() =>
        start(async () => {
          const r = await setOndaAction({ creatorId, on: !on });
          if (r.ok) router.refresh();
        })
      }
      data-testid="onda-toggle"
    >
      {on ? t("inOnda") : t("addOnda")}
    </Button>
  );
}

/** Só para a Groscove: tira o conteúdo do ar (arquiva), com o motivo. */
export function TakedownButton({ contentId }: { contentId: string }) {
  const t = useTranslations("contentLevel.groscove");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" size="sm" variant="secondary" leadingIcon={<Ban />} onClick={() => setOpen(true)} data-testid="takedown-open">
        {t("takedown")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("takedownTitle")}
        description={t("takedownBody")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await takedownContentAction({ contentId, reason });
                  if (!r.ok) return setError(t(r.error === "reason_required" ? "reasonRequired" : "failed"));
                  setOpen(false);
                  router.push("/inicio");
                })
              }
              data-testid="takedown-confirm"
            >
              {t("takedownConfirm")}
            </Button>
          </div>
        }
      >
        <FormField label={t("reason")} error={error ?? undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
        </FormField>
      </Dialog>
    </>
  );
}
