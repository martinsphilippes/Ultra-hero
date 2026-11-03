"use client";

import { Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { transferBrandOwnerAction } from "@/app/marca/actions";
import { Button, Dialog, useToast } from "@/components/ui";

// Transferir a posse da marca (0091): o dono escolhe alguém da Equipe; ele vira Equipe.
export function BrandOwnerTransfer({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations("invites.brand");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" variant="secondary" size="sm" leadingIcon={<Crown />} onClick={() => setOpen(true)} data-testid="brand-transfer-open">
        {t("transfer")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (!next && !pending ? setOpen(false) : undefined)}
        title={t("transferTitle")}
        description={t("transferText", { name })}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const result = await transferBrandOwnerAction({ userId });
                  toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
                  if (result.ok) setOpen(false);
                })
              }
            >
              {t("transferConfirm")}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </>
  );
}
