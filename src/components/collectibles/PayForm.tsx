"use client";

import { MapPinOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { payCollectibleAction } from "@/app/(app)/shop/colecionaveis/actions";
import { Badge, Button, useToast } from "@/components/ui";
import { localizedLabel } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

export type PayDestination = { id: string; name: unknown; zone: string };

type Props = { collectibleId: string; destinations: PayDestination[]; totalLabel: string };

// Pagamento simulado do arremate: escolhe um destino fictício e confirma (vira um pedido de teste).
export function PayForm({ collectibleId, destinations, totalLabel }: Props) {
  const t = useTranslations("collectibles.pay");
  const tz = useTranslations("commerce.cart.destination.zone");
  const locale = useLocale();
  const { toast } = useToast();
  const [destination, setDestination] = useState<string>(destinations[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await payCollectibleAction(collectibleId, destination);
      // sucesso redireciona para o pedido; aqui só chegam erros
      if (result && !result.ok) toast({ title: t(`errors.${result.code}`), variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-semibold text-fg">
          {t("destination")}
          <Badge variant="demo" size="sm" icon={<MapPinOff />}>
            {t("fictional")}
          </Badge>
        </legend>
        {destinations.map((d) => (
          <label
            key={d.id}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
              destination === d.id ? "border-accent bg-accent-soft/40" : "border-border bg-surface hover:bg-surface-hover",
            )}
          >
            <input type="radio" name="destination" value={d.id} checked={destination === d.id} onChange={() => setDestination(d.id)} className="size-5 accent-[var(--uh-accent)]" />
            <span className="flex-1 text-fg">{localizedLabel(d.name, locale)}</span>
            <span className="text-xs text-fg-muted">{tz.has(d.zone) ? tz(d.zone) : d.zone}</span>
          </label>
        ))}
      </fieldset>
      <Button size="lg" block onClick={submit} loading={pending} disabled={!destination} data-testid="pay-collectible">
        {t("submit", { total: totalLabel })}
      </Button>
      <p className="text-xs text-fg-subtle">{t("simulated")}</p>
    </div>
  );
}
