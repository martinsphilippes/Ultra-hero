"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { deleteEventAction } from "@/lib/calendar/actions";

export function EventDeleteButton({ id, dealId, title }: { id: string; dealId: string | null; title: string }) {
  const t = useTranslations("agency.agenda");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  function remove() {
    if (!window.confirm(t("confirmDelete", { title }))) return;
    start(async () => {
      const result = await deleteEventAction({ id, dealId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }
  return (
    <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={remove} disabled={pending} aria-label={t("deleteLabel", { title })}>
      <span className="sr-only sm:not-sr-only">{t("delete")}</span>
    </Button>
  );
}
