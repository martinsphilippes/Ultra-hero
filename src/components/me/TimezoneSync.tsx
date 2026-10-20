"use client";

import { useEffect } from "react";
import { syncTimezone } from "@/app/(app)/profile/actions";
import { getDeviceTimeZone } from "@/lib/utils/timezone";

// Mantém profiles.timezone igual ao fuso do dispositivo (o servidor calcula as datas locais a partir dele).
export function TimezoneSync({ timezone }: { timezone: string | null }) {
  useEffect(() => {
    const device = getDeviceTimeZone();
    if (!device || device === timezone) return;
    void syncTimezone({ timezone: device });
  }, [timezone]);
  return null;
}
