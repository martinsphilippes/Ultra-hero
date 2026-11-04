"use client";

import { Check, Send, Trash2, Undo2, PackageCheck, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, buttonBase, buttonSizes, buttonVariants, FormField, Textarea, useToast } from "@/components/ui";
import { deleteStrategyIdeaAction, setStrategyStatusAction } from "@/lib/strategy/actions";
import type { StrategyIdea } from "@/lib/strategy/queries";
import { sendHref, strategyActions } from "@/lib/strategy/vocab";
import { cn } from "@/lib/utils";

// Ações da ideia conforme a situação e quem vê (o banco confere de novo): enviar para análise, aprovar ou devolver
// (com nota) — Estratégia ou Adm —, material pronto, enviar à marca (oportunidade de patrocínio pré-preenchida) e excluir.
export function IdeaActions({ idea }: { idea: StrategyIdea }) {
  const t = useTranslations("strategy.actions");
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [returning, setReturning] = useState(false);
  const [pending, start] = useTransition();
  const actions = strategyActions(idea.status, idea);

  function status(next: "review" | "approved" | "idea" | "ready") {
    start(async () => {
      const result = await setStrategyStatusAction({ id: idea.id, status: next, note });
      toast(result.ok ? { title: result.message, variant: "success" } : { title: result.error, variant: "error" });
      if (result.ok) {
        setReturning(false);
        setNote("");
        router.refresh();
      }
    });
  }

  function remove() {
    if (!window.confirm(t("deleteConfirm"))) return;
    start(async () => {
      const result = await deleteStrategyIdeaAction({ id: idea.id });
      toast(result.ok ? { title: result.message, variant: "success" } : { title: result.error, variant: "error" });
      if (result.ok) router.push("/agencia/estrategias");
    });
  }

  if (actions.length === 0 && !idea.canDelete) return null;
  return (
    <div className="flex flex-col gap-3 print:hidden" data-testid="strategy-actions">
      <div className="flex flex-wrap gap-2">
        {actions.includes("submit") ? (
          <Button type="button" leadingIcon={<Eye />} loading={pending} onClick={() => status("review")} className="w-full sm:w-fit" data-testid="strategy-submit">
            {t("submit")}
          </Button>
        ) : null}
        {actions.includes("approve") ? (
          <Button type="button" leadingIcon={<Check />} loading={pending} onClick={() => status("approved")} className="w-full sm:w-fit" data-testid="strategy-approve">
            {t("approve")}
          </Button>
        ) : null}
        {actions.includes("return") && !returning ? (
          <Button type="button" variant="secondary" leadingIcon={<Undo2 />} disabled={pending} onClick={() => setReturning(true)} className="w-full sm:w-fit">
            {t("return")}
          </Button>
        ) : null}
        {actions.includes("ready") ? (
          <Button type="button" leadingIcon={<PackageCheck />} loading={pending} onClick={() => status("ready")} className="w-full sm:w-fit" data-testid="strategy-ready">
            {t("ready")}
          </Button>
        ) : null}
        {actions.includes("reopen") ? (
          <Button type="button" variant="secondary" leadingIcon={<Undo2 />} loading={pending} onClick={() => status("approved")} className="w-full sm:w-fit">
            {t("reopen")}
          </Button>
        ) : null}
        {actions.includes("send") ? (
          <Link href={sendHref(idea)} className={cn(buttonBase, buttonVariants.primary, buttonSizes.md, "w-full sm:w-fit")} data-testid="strategy-send">
            <Send className="size-4" aria-hidden="true" />
            {t("send")}
          </Link>
        ) : null}
        {idea.canDelete ? (
          <Button type="button" variant="ghost" leadingIcon={<Trash2 />} disabled={pending} onClick={remove} className="w-full sm:w-fit">
            {t("delete")}
          </Button>
        ) : null}
      </div>
      {actions.includes("send") ? <p className="type-caption text-fg-muted">{t("sendHint")}</p> : null}
      {returning ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <FormField label={t("returnNote")} hint={t("returnNoteHint")} required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} disabled={pending} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" loading={pending} disabled={note.trim().length < 5} onClick={() => status("idea")} className="w-full sm:w-fit">
              {t("returnConfirm")}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setReturning(false)} className="w-full sm:w-fit">
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
