"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { saveDealBriefAction } from "@/lib/brief/actions";
import { briefToDraft, briefValid, draftToBrief, type Brief } from "@/lib/brief/brief";
import { BriefFields } from "./BriefFields";

// Agência ajusta o briefing estruturado do negócio (gestor+ ou responsável/equipe). O banco confere e registra.
export function DealBriefCard({ dealId, brief }: { dealId: string; brief: Brief }) {
  const t = useTranslations("brief");
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => briefToDraft(brief));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    const next = draftToBrief(draft);
    if (!briefValid(next)) return setError(t("hint"));
    start(async () => {
      const result = await saveDealBriefAction({ dealId, brief: next });
      if (!result.ok) return setError(result.error);
      setDraft(briefToDraft(next));
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
      data-testid="deal-brief-form"
    >
      <p className="type-caption text-fg-muted">{t("agencyHint")}</p>
      <BriefFields value={draft} onChange={setDraft} disabled={pending} />
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-fit">
        {t("save")}
      </Button>
    </form>
  );
}
