"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOrderAction } from "@/app/profissional/actions";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import { minNoteLength, nextStatuses, type OrderActor, type OrderStatus } from "@/lib/professionals/rules";

type Props = { orderId: string; status: OrderStatus; actor: Extract<OrderActor, "professional" | "admin"> };

// Responder um pedido (0058): aceitar, recusar, agendar/remarcar, concluir, cancelar ou só mandar
// um recado ao cliente. A RPC service_order_update decide de novo (dono, transição, recado).
export function OrderActions({ orderId, status, actor }: Props) {
  const t = useTranslations("professionals.portal.actions");
  const { toast } = useToast();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const options = nextStatuses(actor, status);
  const open = status === "pending" || status === "accepted" || status === "scheduled";
  if (!open) return null;

  function run(to: OrderStatus | null) {
    const min = to ? minNoteLength(actor, to) : 1;
    if (note.trim().length < min) {
      setError(t("noteRequired"));
      return;
    }
    setError(null);
    setBusy(to ?? "note");
    startTransition(async () => {
      const result = await updateOrderAction({ orderId, to, note: note.trim() });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  const label = (to: OrderStatus) => (to === "scheduled" && status === "scheduled" ? t("reschedule") : t(to as "accepted" | "declined" | "scheduled" | "completed" | "cancelled"));
  const variant = (to: OrderStatus) => (to === "declined" || to === "cancelled" ? "secondary" : to === "accepted" || to === "completed" ? "primary" : "secondary");

  return (
    <section aria-labelledby={`order-actions-${orderId}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="order-actions">
      <h2 id={`order-actions-${orderId}`} className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      <FormField label={t("noteLabel")} hint={t("noteHint")} error={error ?? undefined}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} disabled={pending} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {options.map((to) => (
          <Button key={to} type="button" variant={variant(to)} onClick={() => run(to)} loading={pending && busy === to} disabled={pending} data-testid={`order-to-${to}`}>
            {label(to)}
          </Button>
        ))}
        <Button type="button" variant="ghost" onClick={() => run(null)} loading={pending && busy === "note"} disabled={pending} data-testid="order-note">
          {t("noteOnly")}
        </Button>
      </div>
    </section>
  );
}
