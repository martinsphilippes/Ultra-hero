"use client";

import { Archive, CircleCheck, CircleX, EyeOff, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveContent, publishContent, submitContentForReview, unpublishContent, withdrawContentReview } from "@/app/heroi/conteudos/actions";
import type { ChecklistItem } from "@/components/editors/content/schema";
import { Button, Dialog, useToast } from "@/components/ui";

function useErrorText() {
  const te = useTranslations("creator.errors");
  return (code: string) => {
    const key = code.split(":")[0].trim();
    return te.has(key) ? te(key) : te("generic");
  };
}

// "Publicar": o herói põe o rascunho no ar (creator_publish_content). O checklist é ajuda, não
// trava: o banco recusa só o que é obrigatório (título, corpo, mídia do vídeo e licença).
export function PublishButton({ contentId, checklist }: { contentId: string; checklist: ChecklistItem[] }) {
  const t = useTranslations("creator.publish");
  const tc = useTranslations("common.actions");
  const errorText = useErrorText();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const missing = checklist.filter((i) => !i.ok).length;

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await publishContent({ id: contentId });
      if (result.ok) {
        toast({ title: t("success"), description: t("successDescription"), variant: "success" });
        setOpen(false);
        router.refresh();
      } else {
        setError(errorText(result.error));
      }
    });
  }

  return (
    <>
      <Button type="button" variant="primary" leadingIcon={<Send />} onClick={() => setOpen(true)} data-testid="publish-content">
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
            <Button type="button" onClick={confirm} loading={pending}>
              {t("confirm")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5" aria-label={t("checklist")}>
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                {item.ok ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleX className="size-4 shrink-0 text-warning" aria-hidden="true" />}
                <span className={item.ok ? "text-fg" : "text-fg-muted"}>
                  {t(`items.${item.key}`)}
                  <span className="sr-only">: {item.ok ? t("ok") : t("missing")}</span>
                </span>
              </li>
            ))}
          </ul>
          {missing > 0 && (
            <p role="status" className="type-caption text-fg-muted">
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

// "Despublicar": tira do ar e volta a rascunho editável (creator_unpublish_content).
export function UnpublishButton({ contentId }: { contentId: string }) {
  const t = useTranslations("creator.publish");
  const tc = useTranslations("common.actions");
  const errorText = useErrorText();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await unpublishContent({ id: contentId });
      if (result.ok) {
        toast({ title: t("unpublished"), description: t("unpublishedDescription"), variant: "success" });
        setOpen(false);
        router.refresh();
      } else {
        setError(errorText(result.error));
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" leadingIcon={<EyeOff />} onClick={() => setOpen(true)} data-testid="unpublish-content">
        {t("unpublish")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={t("unpublishTitle")}
        description={t("unpublishDescription")}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={confirm} loading={pending}>
              {t("unpublishConfirm")}
            </Button>
          </div>
        }
      >
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

type ConfirmProps = {
  /** Chaves em creator.publish: botão, título, descrição, confirmar e o aviso de sucesso. */
  keys: { button: string; title: string; description: string; confirm: string; success: string };
  run: (input: { id: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  contentId: string;
  icon: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  danger?: boolean;
  testId: string;
};

// Ação com confirmação (0092): enviar para revisão, retirar da revisão e arquivar.
function ConfirmContentAction({ keys, run, contentId, icon, variant = "secondary", danger = false, testId }: ConfirmProps) {
  const t = useTranslations("creator.publish");
  const tc = useTranslations("common.actions");
  const errorText = useErrorText();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await run({ id: contentId });
      if (result.ok) {
        toast({ title: t(keys.success), variant: "success" });
        setOpen(false);
        router.refresh();
      } else {
        setError(errorText(result.error));
      }
    });
  }

  return (
    <>
      <Button type="button" variant={variant} leadingIcon={icon} onClick={() => setOpen(true)} data-testid={testId}>
        {t(keys.button)}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={t(keys.title)}
        description={t(keys.description)}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant={danger ? "danger" : "primary"} onClick={confirm} loading={pending}>
              {t(keys.confirm)}
            </Button>
          </div>
        }
      >
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

// "Enviar para revisão": quando o admin exige revisão do tipo, o creator manda o rascunho salvo (0092).
export function SubmitReviewButton({ contentId }: { contentId: string }) {
  return (
    <ConfirmContentAction
      contentId={contentId}
      run={submitContentForReview}
      icon={<Send />}
      variant="primary"
      testId="submit-review-content"
      keys={{ button: "submit", title: "submitTitle", description: "submitDescription", confirm: "submitConfirm", success: "submitted" }}
    />
  );
}

// "Retirar da revisão": volta a rascunho editável.
export function WithdrawReviewButton({ contentId }: { contentId: string }) {
  return (
    <ConfirmContentAction
      contentId={contentId}
      run={withdrawContentReview}
      icon={<Undo2 />}
      testId="withdraw-review-content"
      keys={{ button: "withdraw", title: "withdrawTitle", description: "withdrawDescription", confirm: "withdrawConfirm", success: "withdrawn" }}
    />
  );
}

// "Arquivar": o que já esteve no ar só o titular (o banco responde owner_only ao membro).
export function ArchiveContentButton({ contentId }: { contentId: string }) {
  return (
    <ConfirmContentAction
      contentId={contentId}
      run={archiveContent}
      icon={<Archive />}
      variant="ghost"
      danger
      testId="archive-content"
      keys={{ button: "archive", title: "archiveTitle", description: "archiveDescription", confirm: "archiveConfirm", success: "archived" }}
    />
  );
}
