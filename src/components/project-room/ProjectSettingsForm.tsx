"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import { saveProjectSettingsAction } from "@/lib/project-room/actions";

type Props = { norms: string; nda: string; version: number; canEdit: boolean };

// Normas Groscove e modelo de NDA (0110, D5; só o Adm edita). Mudar o NDA sobe a versão: quem assinar daqui em diante
// assina a nova; quem já assinou continua com a versão que assinou.
export function ProjectSettingsForm({ norms, nda, version, canEdit }: Props) {
  const t = useTranslations("projectRoom.settings");
  const { toast } = useToast();
  const [n, setN] = useState(norms);
  const [d, setD] = useState(nda);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    if (n.trim().length < 10 || d.trim().length < 50) return setError(t("tooShort"));
    start(async () => {
      const result = await saveProjectSettingsAction({ norms: n, nda: d });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="project-settings">
      <FormField label={t("norms")} hint={t("normsHint")}>
        <Textarea value={n} rows={8} maxLength={6000} onChange={(e) => setN(e.target.value)} disabled={!canEdit || pending} />
      </FormField>
      <FormField label={t("nda", { version })} hint={t("ndaHint")}>
        <Textarea value={d} rows={14} maxLength={20000} onChange={(e) => setD(e.target.value)} disabled={!canEdit || pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <Button type="button" onClick={save} loading={pending} leadingIcon={<Save />} className="w-full sm:w-fit" data-testid="project-settings-save">
          {t("save")}
        </Button>
      ) : (
        <p className="type-caption text-fg-muted">{t("adminOnly")}</p>
      )}
    </div>
  );
}
