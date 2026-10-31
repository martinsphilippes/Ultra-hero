"use client";

import { XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelRequestAction } from "@/app/marca/actions";
import { Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";

// A marca cancela a própria proposta enquanto a agência não confirmou (depois, só pela agência).
export function CancelCampaignButton({ requestId }: { requestId: string }) {
  const t = useTranslations("brandPortal.campaigns.cancel");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    if (note.trim().length < 5) return setError(t("noteRequired"));
    start(async () => {
      const result = await cancelRequestAction({ id: requestId, note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" leadingIcon={<XCircle />} onClick={() => setOpen(true)} data-testid="campaign-cancel">
        {t("action")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("hint")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="danger" onClick={run} loading={pending}>
              {t("confirm")}
            </Button>
          </>
        }
      >
        <FormField label={t("note")} required error={error}>
          <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
      </Dialog>
    </>
  );
}
