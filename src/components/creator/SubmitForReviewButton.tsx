"use client";

import { CircleCheck, CircleX, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitForReview } from "@/app/creator/content/actions";
import type { ChecklistItem } from "@/components/editors/content/schema";
import { Button, Dialog, useToast } from "@/components/ui";

type Props = { contentId: string; checklist: ChecklistItem[] };

// "Enviar para revisão": mostra o checklist de completude (calculado no servidor sobre o que
// está salvo) e só libera o envio quando tudo está ok. O banco revalida (submit_content_for_review).
export function SubmitForReviewButton({ contentId, checklist }: Props) {
  const t = useTranslations("creator.submit");
  const te = useTranslations("creator.errors");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const complete = checklist.every((i) => i.ok);
  const missing = checklist.filter((i) => !i.ok).length;

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await submitForReview({ id: contentId });
      if (result.ok) {
        toast({ title: t("success"), description: t("successDescription"), variant: "success" });
        setOpen(false);
        router.refresh();
      } else {
        const key = result.error.split(":")[0].trim();
        setError(te.has(key) ? te(key) : te("generic"));
      }
    });
  }

  return (
    <>
      <Button type="button" variant="primary" leadingIcon={<Send />} onClick={() => setOpen(true)}>
        {t("button")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={t("title")}
        description={t("description")}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={confirm} loading={pending} disabled={!complete}>
              {t("confirm")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5" aria-label={t("checklist")}>
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                {item.ok ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleX className="size-4 shrink-0 text-danger" aria-hidden="true" />}
                <span className={item.ok ? "text-fg" : "text-fg-muted"}>
                  {t(`items.${item.key}`)}
                  <span className="sr-only">: {item.ok ? t("ok") : t("missing")}</span>
                </span>
              </li>
            ))}
          </ul>
          {!complete && (
            <p role="status" className="type-caption text-warning">
              {t("incomplete", { count: missing })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
