"use client";

import { PackageCheck, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { transitionFulfillment } from "@/app/seller/fulfillments/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Button, FormField, Input } from "@/components/ui";

type Props = { fulfillmentId: string; status: string };

// Ações do fornecedor sobre a remessa; o sistema cuida de trânsito/entrega (não há botão para isso).
export function FulfillmentActions({ fulfillmentId, status }: Props) {
  const t = useTranslations("seller.fulfillments.detail");
  const te = useTranslations("seller.fulfillments.errors");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canStart = status === "awaiting";
  const canReady = status === "preparing";
  const canCancel = status === "awaiting" || status === "preparing";
  if (!canStart && !canReady && !canCancel) {
    return <p className="type-body-sm text-fg-muted">{t("terminal")}</p>;
  }

  function run(to: "preparing" | "ready_for_dispatch") {
    setError(null);
    startTransition(async () => {
      const result = await transitionFulfillment({ fulfillmentId, to, note: note.trim() || undefined });
      if (result.ok) {
        setNote("");
        router.refresh();
      } else setError(te.has(result.error) ? te(result.error) : te("generic"));
    });
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      <FormField label={t("noteLabel")}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={pending} inputSize="sm" />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {canStart ? (
          <Button type="button" leadingIcon={<Play />} onClick={() => run("preparing")} loading={pending}>
            {t("start")}
          </Button>
        ) : null}
        {canReady ? (
          <Button type="button" leadingIcon={<PackageCheck />} onClick={() => run("ready_for_dispatch")} loading={pending}>
            {t("ready")}
          </Button>
        ) : null}
        {canCancel ? (
          <ConfirmActionDialog
            triggerLabel={t("cancel")}
            triggerVariant="danger"
            triggerSize="md"
            title={t("cancelTitle")}
            description={t("cancelDescription")}
            confirmLabel={t("cancel")}
            requireJustification
            destructive
            disabled={pending}
            action={async (justification) => {
              const result = await transitionFulfillment({ fulfillmentId, to: "cancelled", note: justification });
              if (result.ok) {
                router.refresh();
                return { ok: true, message: t("transitioned") };
              }
              return { ok: false, error: te.has(result.error) ? te(result.error) : te("generic") };
            }}
          />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="type-caption text-fg-muted">{t("systemNote")}</p>
    </div>
  );
}
