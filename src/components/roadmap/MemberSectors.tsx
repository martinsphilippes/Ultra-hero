"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Chip, useToast } from "@/components/ui";
import { setMemberSectorsAction } from "@/lib/roadmap/actions";
import { SECTORS, type Sector } from "@/lib/roadmap/vocab";

// Setores de um membro (Adm): tocar liga/desliga e já salva. As etapas do roteiro vão ao setor.
export function MemberSectors({ userId, name, initial, locked }: { userId: string; name: string; initial: Sector[]; locked: boolean }) {
  const t = useTranslations("roadmap.team");
  const ts = useTranslations("roadmap.sectors");
  const { toast } = useToast();
  const [value, setValue] = useState<Sector[]>(initial);
  const [pending, start] = useTransition();

  function toggle(sector: Sector) {
    const next = value.includes(sector) ? value.filter((s) => s !== sector) : [...value, sector];
    const before = value;
    setValue(next);
    start(async () => {
      const result = await setMemberSectorsAction({ userId, sectors: next });
      if (!result.ok) {
        setValue(before);
        toast({ title: result.error, variant: "error" });
      }
    });
  }

  return (
    <div role="group" aria-label={t("label", { name })} className="flex flex-wrap gap-1.5" data-testid="member-sectors">
      {SECTORS.map((s) => (
        <Chip key={s} selected={value.includes(s)} variant="accent" onClick={() => toggle(s)} disabled={locked || pending} className="min-h-11">
          {ts(s)}
        </Chip>
      ))}
    </div>
  );
}
