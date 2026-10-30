"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelServiceOrder } from "@/app/(app)/profissionais/actions";
import { Button, Dialog, useToast } from "@/components/ui";

// Cliente cancela enquanto o profissional não respondeu (service_order_update confere de novo).
export function CancelServiceOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("professionals.orders");
  const te = useTranslations("professionals.errors");
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelServiceOrder({ orderId });
      if (!result.ok) {
        setError(te.has(result.error) ? te(result.error) : te("generic"));
        return;
      }
      setOpen(false);
      toast({ title: t("cancelled"), variant: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} data-testid="service-order-cancel">
        {t("cancel")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (pending ? undefined : setOpen(next))}
        title={t("cancelTitle")}
        description={t("cancelDescription")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("keep")}
            </Button>
            <Button type="button" variant="danger" onClick={confirm} loading={pending}>
              {t("cancel")}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
