"use client";

import { ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { saveShortlistAction, setShortlistItemAction } from "@/lib/selection/actions";
import { REASON_MAX, reasonValid, shortlistTitleValid } from "@/lib/selection/logic";

type Props = {
  talentId: string;
  talentName: string;
  lists: { id: string; title: string }[];
};

const NEW = "__new__";

// Perfil do creator no catálogo (0081): põe o creator numa pré-seleção em montagem (ou numa lista nova) com o motivo.
export function AddToShortlist({ talentId, talentName, lists }: Props) {
  const t = useTranslations("selection.shortlists");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [listId, setListId] = useState(lists[0]?.id ?? NEW);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    if (listId === NEW && !shortlistTitleValid(title)) return setError(t("titleInvalid"));
    if (!reasonValid(reason)) return setError(t("reasonInvalid"));
    start(async () => {
      let target = listId;
      if (target === NEW) {
        const created = await saveShortlistAction({
          id: null,
          title: title.trim(),
          note: "",
        });
        if (!created.ok || !created.id) return setError(created.ok ? t("titleInvalid") : created.error);
        target = created.id;
      }
      const result = await setShortlistItemAction({
        shortlistId: target,
        talentId,
        reason: reason.trim(),
      });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(false);
      router.push(`/marca/creators/pre-selecao/${target}`);
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" leadingIcon={<ListPlus />} onClick={() => setOpen(true)} data-testid="shortlist-add">
        {t("add")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("addTitle", { name: talentName })}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={add} loading={pending} leadingIcon={<ListPlus />} data-testid="shortlist-add-confirm">
              {t("addConfirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FormField label={t("pickList")} required>
            <Select value={listId} onChange={(e) => setListId(e.target.value)} disabled={pending}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
              <option value={NEW}>{t("createNew")}</option>
            </Select>
          </FormField>
          {listId === NEW ? (
            <FormField label={t("newListName")} required>
              <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
            </FormField>
          ) : null}
          <FormField label={t("reason")} hint={t("reasonHint")} required error={error}>
            <Textarea value={reason} maxLength={REASON_MAX} rows={3} onChange={(e) => setReason(e.target.value)} disabled={pending} />
          </FormField>
        </div>
      </Dialog>
    </>
  );
}
