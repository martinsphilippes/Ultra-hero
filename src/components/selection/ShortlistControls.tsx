"use client";

import { Check, Megaphone, Plus, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Button, Dialog, FormField, Input, Textarea, useToast } from "@/components/ui";
import {
  decideShortlistItemAction,
  deleteShortlistAction,
  removeShortlistItemAction,
  saveShortlistAction,
  sendShortlistAction,
  shortlistToCampaignAction,
  type SelectionResult,
} from "@/lib/selection/actions";
import { NOTE_MAX, shortlistTitleValid } from "@/lib/selection/logic";

// Pré-seleção (0081): criar lista, enviar ao diretor, apagar rascunho, tirar creator, decidir (diretor) e virar
// campanha. Cada ação confirma num diálogo curto; o banco confere o papel de novo.

function useRun() {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<SelectionResult>, after?: (r: Extract<SelectionResult, { ok: true }>) => void) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      if (after) after(result);
      else router.refresh();
    });
  };
  return { run, error, setError, pending, router };
}

function Confirm({
  open,
  onOpenChange,
  title,
  hint,
  confirm,
  onConfirm,
  pending,
  danger,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  hint?: string;
  confirm: ReactNode;
  onConfirm: () => void;
  pending: boolean;
  danger?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("selection.shortlists");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={hint}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={pending} data-testid="shortlist-confirm">
            {confirm}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

export function NewShortlistButton() {
  const t = useTranslations("selection.shortlists");
  const { run, error, setError, pending, router } = useRun();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const create = () => {
    if (!shortlistTitleValid(title)) return setError(t("titleInvalid"));
    run(
      () =>
        saveShortlistAction({
          id: null,
          title: title.trim(),
          note: note.trim(),
        }),
      (r) => {
        setOpen(false);
        if (r.id) router.push(`/marca/creators/pre-selecao/${r.id}`);
      },
    );
  };
  return (
    <>
      <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setOpen(true)} data-testid="shortlist-new">
        {t("new")}
      </Button>
      <Confirm open={open} onOpenChange={setOpen} title={t("newTitle")} confirm={t("create")} onConfirm={create} pending={pending}>
        <div className="flex flex-col gap-4">
          <FormField label={t("titleLabel")} required error={error}>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
          </FormField>
          <FormField label={t("noteLabel")}>
            <Textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
        </div>
      </Confirm>
    </>
  );
}

type ToolbarProps = {
  id: string;
  title: string;
  canSend: boolean;
  canDelete: boolean;
  canCampaign: boolean;
};

export function ShortlistToolbar({ id, title, canSend, canDelete, canCampaign }: ToolbarProps) {
  const t = useTranslations("selection.shortlists");
  const { run, error, pending, router } = useRun();
  const [open, setOpen] = useState<"send" | "delete" | "campaign" | null>(null);
  const [name, setName] = useState(title);
  if (!canSend && !canDelete && !canCampaign) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <Button type="button" leadingIcon={<Send />} onClick={() => setOpen("send")} data-testid="shortlist-send">
            {t("send")}
          </Button>
        ) : null}
        {canCampaign ? (
          <Button type="button" leadingIcon={<Megaphone />} onClick={() => setOpen("campaign")} data-testid="shortlist-to-campaign">
            {t("toCampaign")}
          </Button>
        ) : null}
        {canDelete ? (
          <Button type="button" variant="ghost" leadingIcon={<Trash2 />} onClick={() => setOpen("delete")} data-testid="shortlist-delete">
            {t("delete")}
          </Button>
        ) : null}
      </div>
      {error && !open ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Confirm
        open={open === "send"}
        onOpenChange={(v) => setOpen(v ? "send" : null)}
        title={t("sendTitle")}
        hint={t("sendHint")}
        confirm={t("send")}
        pending={pending}
        onConfirm={() =>
          run(
            () => sendShortlistAction({ id }),
            () => {
              setOpen(null);
              router.refresh();
            },
          )
        }
      >
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </Confirm>
      <Confirm
        open={open === "delete"}
        onOpenChange={(v) => setOpen(v ? "delete" : null)}
        title={t("deleteTitle")}
        hint={t("deleteHint")}
        confirm={t("delete")}
        danger
        pending={pending}
        onConfirm={() =>
          run(
            () => deleteShortlistAction({ id }),
            () => router.push("/marca/creators/pre-selecao"),
          )
        }
      >
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </Confirm>
      <Confirm
        open={open === "campaign"}
        onOpenChange={(v) => setOpen(v ? "campaign" : null)}
        title={t("toCampaignTitle")}
        hint={t("toCampaignHint")}
        confirm={t("toCampaign")}
        pending={pending}
        onConfirm={() =>
          run(
            () => shortlistToCampaignAction({ id, title: name.trim() }),
            (r) => r.id && router.push(`/marca/campanhas/${r.id}`),
          )
        }
      >
        <FormField label={t("campaignTitle")} error={error}>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </FormField>
      </Confirm>
    </div>
  );
}

export function RemoveItemButton({ itemId, name }: { itemId: string; name: string }) {
  const t = useTranslations("selection.shortlists");
  const { run, error, pending } = useRun();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" leadingIcon={<X />} onClick={() => run(() => removeShortlistItemAction({ itemId }))} loading={pending} aria-label={`${t("remove")} · ${name}`}>
        {t("remove")}
      </Button>
      {error ? (
        <span role="alert" className="type-caption text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function DecideItem({ itemId, current }: { itemId: string; current: "approved" | "rejected" | null }) {
  const t = useTranslations("selection.shortlists");
  const { run, error, pending } = useRun();
  const [open, setOpen] = useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = useState("");
  const decide = (decision: "approved" | "rejected") =>
    run(
      () => decideShortlistItemAction({ itemId, decision, note: note.trim() }),
      () => {
        setOpen(null);
        setNote("");
      },
    );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={current === "approved" ? "primary" : "secondary"}
          leadingIcon={<Check />}
          aria-pressed={current === "approved"}
          onClick={() => setOpen("approved")}
          disabled={pending}
          data-testid="shortlist-approve"
        >
          {t("approve")}
        </Button>
        <Button
          type="button"
          variant={current === "rejected" ? "danger" : "secondary"}
          leadingIcon={<X />}
          aria-pressed={current === "rejected"}
          onClick={() => setOpen("rejected")}
          disabled={pending}
          data-testid="shortlist-reject"
        >
          {t("reject")}
        </Button>
      </div>
      {error && !open ? (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      ) : null}
      <Confirm
        open={open !== null}
        onOpenChange={(v) => (v ? null : setOpen(null))}
        title={open === "rejected" ? t("reject") : t("approve")}
        confirm={open === "rejected" ? t("reject") : t("approve")}
        danger={open === "rejected"}
        pending={pending}
        onConfirm={() => open && decide(open)}
      >
        <FormField label={t("decisionNote")} error={error}>
          <Textarea value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
      </Confirm>
    </div>
  );
}
