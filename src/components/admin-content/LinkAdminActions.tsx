"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchContentAction, searchProductsAction } from "@/app/admin/content-actions";
import { createLinkAction, setLinkStatusAction } from "@/app/admin/links/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { SearchPicker, type PickItem } from "./SearchPicker";

type Status = "suggested" | "validated" | "suspended" | "rejected";

// Validar / suspender / rejeitar um vínculo (2 passos; observação opcional ou obrigatória).
export function LinkActions({ linkId, status }: { linkId: string; status: Status }) {
  const t = useTranslations("adminContent.links.actions");
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status !== "validated" && (
        <ConfirmActionDialog
          triggerLabel={t("validate")}
          triggerVariant="primary"
          title={t("validateTitle")}
          description={t("validateDescription")}
          confirmLabel={t("validate")}
          action={(note) => setLinkStatusAction(linkId, "validated", note)}
        />
      )}
      {status !== "suspended" && status !== "rejected" && (
        <ConfirmActionDialog triggerLabel={t("suspend")} title={t("suspendTitle")} requireJustification action={(note) => setLinkStatusAction(linkId, "suspended", note)} />
      )}
      {status !== "rejected" && (
        <ConfirmActionDialog triggerLabel={t("reject")} triggerVariant="danger" destructive title={t("rejectTitle")} requireJustification action={(note) => setLinkStatusAction(linkId, "rejected", note)} />
      )}
    </div>
  );
}

// Criar vínculo manualmente (conteúdo + produto via busca) e validar.
export function CreateLinkDialog() {
  const t = useTranslations("adminContent.links.create");
  const tl = useTranslations("adminContent.links");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<PickItem | null>(null);
  const [product, setProduct] = useState<PickItem | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!content || !product) {
      setError(t("pickBoth"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createLinkAction(content.id, product.id, note);
      if (result.ok) {
        toast({ title: result.message ?? tc("done"), variant: "success" });
        setOpen(false);
        setContent(null);
        setProduct(null);
        setNote("");
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setOpen(true)}>
        {tl("new")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title")}
        description={t("description")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={submit} loading={pending}>
              {t("submit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <SearchPicker label={t("content")} search={(q) => searchContentAction(q, false)} value={content} onChange={setContent} />
          <SearchPicker label={t("product")} search={searchProductsAction} value={product} onChange={setProduct} />
          <FormField label={t("note")} optionalLabel={tc("optional")}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </FormField>
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
