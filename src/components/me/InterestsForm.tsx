"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveInterests } from "@/app/(app)/profile/actions";
import { Button, useToast } from "@/components/ui";
import { InterestTagGrid, type InterestGroup } from "./InterestTagGrid";

type Props = { groups: InterestGroup[]; initial: string[] };

// Interesses do perfil: grade de temas + salvar (recalcula recomendações no servidor).
export function InterestsForm({ groups, initial }: Props) {
  const t = useTranslations("me.interests");
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(initial);
  const [saved, setSaved] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();

  const dirty = selected.length !== saved.length || selected.some((tag) => !saved.includes(tag));

  function onSave() {
    startTransition(async () => {
      const result = await saveInterests({ tags: selected });
      if (!result.ok) {
        toast({ title: t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"), variant: "error" });
        return;
      }
      setSaved(selected);
      toast({ title: result.recalculated ? t("saved") : t("savedNoRecalc"), variant: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <InterestTagGrid groups={groups} selected={selected} onChange={setSelected} disabled={pending} />
      <div className="flex justify-end">
        <Button variant="primary" onClick={onSave} loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
