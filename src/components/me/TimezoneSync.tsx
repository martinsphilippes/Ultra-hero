"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { syncTimezone } from "@/app/(app)/profile/actions";
import { getDeviceTimeZone } from "@/lib/utils/timezone";

// Mantém profiles.timezone igual ao fuso do dispositivo (o servidor calcula as datas locais a partir dele).
// Quando o fuso muda (viagem, ou conta demo usada antes em outro fuso), a página atual foi montada com o
// fuso antigo: atualiza na hora para os horários ("sincronizado às", "até HH:MM", datas do dia) baterem.
export function TimezoneSync({ timezone }: { timezone: string | null }) {
  const router = useRouter();
  // no máximo uma atualização por montagem: se o servidor ainda devolver o fuso antigo, não entra em ciclo
  const refreshed = useRef(false);
  useEffect(() => {
    const device = getDeviceTimeZone();
    if (!device || device === timezone) return;
    let active = true;
    void syncTimezone({ timezone: device }).then((result) => {
      if (!active || !result.ok || refreshed.current) return;
      refreshed.current = true;
      router.refresh();
    });
    return () => {
      active = false;
    };
  }, [timezone, router]);
  return null;
}
