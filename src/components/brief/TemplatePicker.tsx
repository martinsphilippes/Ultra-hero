"use client";

import { FilePlus2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, useToast } from "@/components/ui";
import { applyTemplateAction, deleteTemplateAction } from "@/lib/brief/actions";
import type { BriefTemplate } from "@/lib/brief/queries";
import { MAX_TEMPLATES } from "@/lib/brief/templates";

// Nova campanha (0080): começar de um modelo de briefing da marca (cria o rascunho e abre) ou apagar o modelo.
export function TemplatePicker({ templates }: { templates: BriefTemplate[] }) {
  const t = useTranslations("brief.templates");
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<BriefTemplate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply(id: string) {
    setError(null);
    setBusy(id);
    start(async () => {
      const result = await applyTemplateAction({ id });
      setBusy(null);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      if (result.id) router.push(`/marca/campanhas/${result.id}`);
    });
  }

  function remove() {
    if (!confirm) return;
    const id = confirm.id;
    setError(null);
    start(async () => {
      const result = await deleteTemplateAction({ id });
      setConfirm(null);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="tpl-title" data-testid="template-picker">
      <h2 id="tpl-title" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      <p className="type-caption text-fg-muted">
        {t("hint")} {t("limit", { count: MAX_TEMPLATES })}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {templates.map((tpl) => (
          <li key={tpl.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium break-words text-fg">{tpl.name}</span>
              <span className="type-caption text-fg-muted">
                {t("deliverables", { count: tpl.deliverableCount })}
                {tpl.hasBrief ? ` · ${t("withBrief")}` : ""}
              </span>
            </span>
            <Button type="button" size="sm" leadingIcon={<FilePlus2 />} onClick={() => apply(tpl.id)} loading={pending && busy === tpl.id} disabled={pending} data-testid="template-use">
              {t("use")}
            </Button>
            <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => setConfirm(tpl)} disabled={pending} aria-label={`${t("delete")} · ${tpl.name}`}>
              <span className="sr-only sm:not-sr-only">{t("delete")}</span>
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => (!o ? setConfirm(null) : null)}
        title={confirm ? t("deleteConfirm", { name: confirm.name }) : ""}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="danger" leadingIcon={<Trash2 />} onClick={remove} loading={pending}>
              {t("delete")}
            </Button>
          </>
        }
      />
    </section>
  );
}
