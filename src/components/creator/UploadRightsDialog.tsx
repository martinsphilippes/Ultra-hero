"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button, Checkbox, Dialog } from "@/components/ui";
import { confirmUploadRights } from "@/lib/partner-terms/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de a confirmação ficar gravada: a tela refaz o envio. */
  onConfirmed: () => void;
};

// Declaração de direitos antes do primeiro envio de foto ou vídeo (Termos do Parceiro, 0068). A action de
// envio devolve upload_rights_required; a tela abre este aviso e, confirmado, envia de novo.
export function UploadRightsDialog({ open, onOpenChange, onConfirmed }: Props) {
  const t = useTranslations("legal.consent");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(false);
    startTransition(async () => {
      const result = await confirmUploadRights().catch(() => ({ ok: false as const }));
      if (!result.ok) {
        setError(true);
        return;
      }
      onOpenChange(false);
      onConfirmed();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={t("uploadTitle")}
      description={t("uploadBody")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button onClick={confirm} disabled={!checked} loading={pending}>
            {t("uploadConfirm")}
          </Button>
        </>
      }
    >
      <Checkbox id="upload-rights" checked={checked} onChange={(event) => setChecked(event.target.checked)} label={t.rich("uploadLabel", legalRichTags)} />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t("error")}
        </p>
      ) : null}
    </Dialog>
  );
}
