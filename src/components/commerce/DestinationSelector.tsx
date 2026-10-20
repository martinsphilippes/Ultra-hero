"use client";

import { MapPinOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { setDestination } from "@/app/(app)/cart/actions";
import { Badge, Select, useToast } from "@/components/ui";
import { localizedLabel } from "@/lib/catalog/queries";

export type DestinationOption = {
  id: string;
  code: string;
  name: Record<string, string>;
  zone: "local" | "regional" | "national";
  description: Record<string, string> | null;
};

type Props = { destinations: DestinationOption[]; selectedId: string | null; compact?: boolean };

// Seleção de destino fictício (predefinido; sem endereço real). Persiste em cookie via action.
export function DestinationSelector({ destinations, selectedId, compact = false }: Props) {
  const t = useTranslations("commerce.cart.destination");
  const td = useTranslations("commerce.demo");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const selected = destinations.find((d) => d.id === selectedId) ?? null;

  function change(value: string) {
    startTransition(async () => {
      const result = await setDestination({ destinationId: value || null });
      if (result.ok) {
        toast({ title: t("saved"), variant: "success", duration: 2000 });
        router.refresh();
      } else {
        toast({ title: t("hint"), variant: "error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2" aria-busy={pending || undefined}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {t("label")}
        </label>
        <Badge variant="demo" size="sm" icon={<MapPinOff />}>
          {td("fictional")}
        </Badge>
      </div>
      <Select id={id} value={selectedId ?? ""} onChange={(e) => change(e.target.value)} disabled={pending} aria-describedby={`${id}-hint`}>
        <option value="">{t("placeholder")}</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {localizedLabel(d.name, locale)} · {t(`zone.${d.zone}`)}
          </option>
        ))}
      </Select>
      <p id={`${id}-hint`} className="type-caption text-fg-muted">
        {selected && !compact ? `${localizedLabel(selected.description, locale)} · ${t("zoneLabel")}: ${t(`zone.${selected.zone}`)}` : t("hint")}
      </p>
    </div>
  );
}
