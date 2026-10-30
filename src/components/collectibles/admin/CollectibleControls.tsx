"use client";

import { Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelCollectibleAction, launchCollectibleAction } from "@/app/admin/collectibles/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Button, FormField, Input, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  /** Pode lançar/reagendar (rascunho ou agendado sem lances). */
  canLaunch: boolean;
  /** Pode cancelar (não encerrado nem cancelado). */
  canCancel: boolean;
  durationMinutes: number;
};

// Lançar agora ou agendar (o fim = início + duração) e cancelar com justificativa (auditados).
export function CollectibleControls({ id, canLaunch, canCancel, durationMinutes }: Props) {
  const t = useTranslations("collectibles.admin.launch");
  const tc = useTranslations("collectibles.admin.cancel");
  const router = useRouter();
  const { toast } = useToast();
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startsAt, setStartsAt] = useState("");
  const [pending, startTransition] = useTransition();

  const startMs = when === "now" ? null : startsAt ? new Date(startsAt).getTime() : NaN;
  const endPreview =
    startMs === null ? null : Number.isFinite(startMs) ? new Date(startMs + durationMinutes * 60_000).toLocaleString() : null;

  function launch() {
    if (when === "later" && !Number.isFinite(startMs)) {
      toast({ title: t("pickDate"), variant: "error" });
      return;
    }
    startTransition(async () => {
      const result = await launchCollectibleAction(id, when === "now" ? null : new Date(startMs as number).toISOString());
      if (result.ok) {
        toast({ title: result.message ?? t("liveDone"), variant: "success" });
        router.refresh();
      } else {
        toast({ title: result.error, variant: "error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canLaunch ? (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label={t("whenLabel")} className="grid grid-cols-2 gap-2">
            {(["now", "later"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold",
                  when === option ? "border-accent bg-accent-soft/40 text-fg" : "border-border text-fg-muted",
                )}
              >
                <input type="radio" name={`when-${id}`} value={option} checked={when === option} onChange={() => setWhen(option)} className="size-5 accent-[var(--uh-accent)]" />
                {t(option)}
              </label>
            ))}
          </div>
          {when === "later" ? (
            <FormField label={t("startsAt")}>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </FormField>
          ) : null}
          <p className="text-xs text-fg-muted">{endPreview ? t("endsPreview", { date: endPreview }) : t("endsNow", { minutes: durationMinutes })}</p>
          <Button size="lg" block leadingIcon={<Rocket />} onClick={launch} loading={pending} data-testid="launch-collectible">
            {when === "now" ? t("launchNow") : t("schedule")}
          </Button>
        </div>
      ) : null}
      {canCancel ? (
        <ConfirmActionDialog
          triggerLabel={tc("trigger")}
          triggerVariant="danger"
          triggerSize="md"
          title={tc("title")}
          description={tc("description")}
          requireJustification
          destructive
          confirmLabel={tc("confirm")}
          action={async (reason) => {
            const result = await cancelCollectibleAction(id, reason);
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ) : null}
    </div>
  );
}
