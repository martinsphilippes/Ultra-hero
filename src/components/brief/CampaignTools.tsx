"use client";

import { BookmarkPlus, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { duplicateCampaignAction, saveTemplateAction } from "@/lib/brief/actions";
import { templateNameValid } from "@/lib/brief/templates";

type Props = { requestId: string; title: string; canDuplicate?: boolean };

// Campanha da marca (0080): duplicar (rascunho novo sem datas, valor e situação) e salvar como modelo de briefing.
export function CampaignTools({ requestId, title, canDuplicate = true }: Props) {
  const t = useTranslations("brief");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState<"duplicate" | "template" | null>(null);
  const [name, setName] = useState(title.slice(0, 80));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setOpen(null);
    setError(null);
  }

  function duplicate() {
    setError(null);
    start(async () => {
      const result = await duplicateCampaignAction({ requestId, title });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      close();
      if (result.id) router.push(`/marca/campanhas/${result.id}`);
    });
  }

  function saveTemplate() {
    setError(null);
    if (!templateNameValid(name)) return setError(t("templates.nameInvalid"));
    start(async () => {
      const result = await saveTemplateAction({ requestId, name: name.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      close();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canDuplicate ? (
        <Button type="button" variant="secondary" size="sm" leadingIcon={<Copy />} onClick={() => setOpen("duplicate")} data-testid="campaign-duplicate">
          {t("duplicate.action")}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="sm" leadingIcon={<BookmarkPlus />} onClick={() => setOpen("template")} data-testid="campaign-save-template">
        {t("templates.saveAs")}
      </Button>
      <Dialog
        open={open === "duplicate"}
        onOpenChange={(o) => (!o ? close() : null)}
        title={t("duplicate.confirmTitle")}
        description={t("duplicate.confirmHint")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              {t("duplicate.back")}
            </Button>
            <Button type="button" leadingIcon={<Copy />} onClick={duplicate} loading={pending} data-testid="campaign-duplicate-confirm">
              {t("duplicate.confirm")}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
      <Dialog
        open={open === "template"}
        onOpenChange={(o) => (!o ? close() : null)}
        title={t("templates.dialogTitle")}
        description={t("templates.dialogHint")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              {t("templates.back")}
            </Button>
            <Button type="button" leadingIcon={<BookmarkPlus />} onClick={saveTemplate} loading={pending} data-testid="campaign-save-template-confirm">
              {t("templates.save")}
            </Button>
          </>
        }
      >
        <FormField label={t("templates.nameLabel")} hint={t("templates.nameHint")} error={error ?? undefined} required>
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </FormField>
      </Dialog>
    </div>
  );
}
