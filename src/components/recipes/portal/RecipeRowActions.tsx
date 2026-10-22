"use client";

import { Archive, ChevronDown, Copy, ExternalLink, Eye, History, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { archiveRecipe, deleteRecipeDraft, duplicateRecipe, restoreRecipe, unpublishRecipe, withdrawRecipe } from "@/app/creator/recipes/actions";
import { Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { MyRecipeStatus } from "@/lib/recipes/portal";
import { cn } from "@/lib/utils";
import { useRecipeErrorText } from "./use-recipe-error";

type Allowed = { edit: boolean; unpublish: boolean; withdraw: boolean; archive: boolean; restore: boolean; remove: boolean; duplicate: boolean };
type Props = { id: string; title: string; slug: string; situation: MyRecipeStatus; allowed: Allowed };
type Pending = "delete" | "archive" | "unpublish" | "withdraw" | null;

const itemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus disabled:opacity-50";

// Ações de uma receita na lista: a principal (Editar/Abrir) fica visível; as demais num menu de
// divulgação (botão com aria-expanded) que abre no fluxo da linha. Exclusão, arquivamento, despublicação e retirada da
// revisão pedem confirmação; o banco confere a regra de novo em cada RPC.
export function RecipeRowActions({ id, title, slug, situation, allowed }: Props) {
  const t = useTranslations("recipes.portal");
  const errorText = useRecipeErrorText();
  const { toast } = useToast();
  const router = useRouter();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // fecha o menu com Esc ou clique fora
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(errorText(result.error));
          return;
        }
        toast({ title: done, variant: "success" });
        setConfirm(null);
        setOpen(false);
        after?.();
        router.refresh();
      } catch {
        setError(errorText("network"));
      }
    });
  }

  function duplicate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await duplicateRecipe({ id });
        if (!result.ok) {
          toast({ title: errorText(result.error), variant: "error" });
          return;
        }
        toast({ title: t("done.duplicated"), variant: "success" });
        router.push(`/creator/recipes/${result.id}/edit`);
      } catch {
        toast({ title: errorText("network"), variant: "error" });
      }
    });
  }

  const dialogs: Record<Exclude<Pending, null>, { title: string; description: string; label: string; destructive: boolean; onConfirm: () => void; extra?: ReactNode }> = {
    delete: { title: t("confirm.deleteTitle", { title }), description: t("confirm.deleteDescription"), label: t("actions.delete"), destructive: true, onConfirm: () => run(() => deleteRecipeDraft({ id }), t("done.deleted")) },
    archive: {
      title: t("confirm.archiveTitle", { title }),
      description: t("confirm.archiveDescription"),
      label: t("actions.archive"),
      destructive: false,
      onConfirm: () => run(() => archiveRecipe({ id, reason }), t("done.archived")),
      extra: (
        <FormField label={t("confirm.archiveReason")}>
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      ),
    },
    unpublish: { title: t("confirm.unpublishTitle", { title }), description: t("confirm.unpublishDescription"), label: t("actions.unpublish"), destructive: false, onConfirm: () => run(() => unpublishRecipe({ id }), t("done.unpublished")) },
    withdraw: { title: t("confirm.withdrawTitle", { title }), description: t("confirm.withdrawDescription"), label: t("actions.withdraw"), destructive: false, onConfirm: () => run(() => withdrawRecipe({ id }), t("done.withdrawn")) },
  };
  const active = confirm ? dialogs[confirm] : null;

  return (
    <div ref={wrapperRef} className="relative flex flex-wrap items-center justify-end gap-1">
      <Button asChild variant="secondary" leadingIcon={allowed.edit ? <Pencil /> : <Eye />}>
        <Link href={`/creator/recipes/${id}/edit`}>{allowed.edit ? t("actions.edit") : t("actions.open")}</Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("actions.menu", { title })}
        trailingIcon={<ChevronDown className={cn("transition-transform", open && "rotate-180")} />}
        onClick={() => setOpen((v) => !v)}
        data-testid="recipe-row-menu"
      >
        <span aria-hidden="true">···</span>
      </Button>
      {open && (
        // no fluxo (não flutuante): a tabela tem overflow-hidden e cortaria um menu absoluto
        <ul id={menuId} className="mt-1 flex min-w-56 basis-full flex-col gap-0.5 rounded-xl border border-border bg-surface-elevated p-1.5 text-left">
          <li>
            <Link className={itemClass} href={`/creator/recipes/${id}/preview`}>
              <Eye className="size-4" aria-hidden="true" />
              {t("actions.preview")}
            </Link>
          </li>
          {situation === "published" && (
            <li>
              <Link className={itemClass} href={`/content/${slug}`}>
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("actions.viewPublic")}
              </Link>
            </li>
          )}
          <li>
            <Link className={itemClass} href={`/creator/recipes/${id}/versions`}>
              <History className="size-4" aria-hidden="true" />
              {t("actions.versions")}
            </Link>
          </li>
          {allowed.duplicate && (
            <li>
              <button type="button" className={itemClass} onClick={duplicate} disabled={busy}>
                <Copy className="size-4" aria-hidden="true" />
                {t("actions.duplicate")}
              </button>
            </li>
          )}
          {allowed.unpublish && (
            <li>
              <button type="button" className={itemClass} onClick={() => setConfirm("unpublish")}>
                <Undo2 className="size-4" aria-hidden="true" />
                {t("actions.unpublish")}
              </button>
            </li>
          )}
          {allowed.withdraw && (
            <li>
              <button type="button" className={itemClass} onClick={() => setConfirm("withdraw")}>
                <Undo2 className="size-4" aria-hidden="true" />
                {t("actions.withdraw")}
              </button>
            </li>
          )}
          {allowed.restore && (
            <li>
              <button type="button" className={itemClass} onClick={() => run(() => restoreRecipe({ id }), t("done.restored"))} disabled={busy}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {t("actions.restore")}
              </button>
            </li>
          )}
          {allowed.archive && (
            <li>
              <button type="button" className={itemClass} onClick={() => setConfirm("archive")}>
                <Archive className="size-4" aria-hidden="true" />
                {t("actions.archive")}
              </button>
            </li>
          )}
          {allowed.remove && (
            <li>
              <button type="button" className={cn(itemClass, "text-danger")} onClick={() => setConfirm("delete")} data-testid="recipe-delete">
                <Trash2 className="size-4" aria-hidden="true" />
                {t("actions.delete")}
              </button>
            </li>
          )}
        </ul>
      )}
      {error && !active ? (
        <p role="alert" className="w-full text-right type-caption text-danger">
          {error}
        </p>
      ) : null}
      {active && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !busy) {
              setConfirm(null);
              setError(null);
            }
          }}
          title={active.title}
          description={active.description}
          size="sm"
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                {t("confirm.cancel")}
              </Button>
              <Button type="button" variant={active.destructive ? "danger" : "primary"} loading={busy} onClick={active.onConfirm} data-testid="recipe-confirm">
                {active.label}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {active.extra}
            {error && (
              <p role="alert" className="type-body-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
