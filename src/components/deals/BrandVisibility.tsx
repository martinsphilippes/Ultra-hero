"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setBrandVisibleAction } from "@/app/agencia/negocios/actions";
import { Badge, Button, Dialog, useToast } from "@/components/ui";

// 0121: "Mostrar para a marca" no cabeçalho do negócio. Oculto → selo "Oculto da marca" + botão (com confirmação curta
// do que a marca passa a ver); visível → selo "Visível para a marca" + "Ocultar" (só antes da confirmação e só em
// negócio aberto pela agência). Quem não mexe no negócio vê só o selo. A RPC confere tudo de novo.
export function BrandVisibility({
  dealId,
  visible,
  canEdit,
  canHide,
}: {
  dealId: string;
  visible: boolean;
  canEdit: boolean;
  canHide: boolean;
}) {
  const t = useTranslations("agency.deal.brandVisibility");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(next: boolean) {
    setError(null);
    start(async () => {
      const result = await setBrandVisibleAction({ dealId, visible: next });
      if (!result.ok) {
        if (next) setError(result.error);
        else toast({ title: result.error, variant: "error" });
        return;
      }
      toast({ title: result.message, variant: "success" });
      setOpen(false);
    });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="deal-brand-visibility"
    >
      {visible ? (
        <Badge
          variant="success"
          icon={<Eye aria-hidden="true" />}
          data-testid="deal-brand-visible"
        >
          {t("visible")}
        </Badge>
      ) : (
        <Badge
          variant="neutral"
          icon={<EyeOff aria-hidden="true" />}
          data-testid="deal-brand-hidden"
        >
          {t("hidden")}
        </Badge>
      )}
      {canEdit && !visible ? (
        <Button
          type="button"
          size="sm"
          leadingIcon={<Eye />}
          onClick={() => setOpen(true)}
          data-testid="deal-brand-show"
        >
          {t("show")}
        </Button>
      ) : null}
      {canEdit && visible && canHide ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          leadingIcon={<EyeOff />}
          onClick={() => run(false)}
          loading={pending}
          data-testid="deal-brand-hide"
        >
          {t("hide")}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogHint")}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t("back")}
            </Button>
            <Button
              type="button"
              onClick={() => run(true)}
              loading={pending}
              data-testid="deal-brand-show-run"
            >
              {t("show")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 type-body-sm text-fg">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>{t("sees")}</li>
            <li>{t("notSees")}</li>
            <li>{t("notify")}</li>
          </ul>
          <p className="text-fg-muted">{t("hideNote")}</p>
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
