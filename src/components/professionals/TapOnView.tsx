"use client";

import { useEffect } from "react";
import type { ProfessionalTap } from "@/lib/professionals/rules";
import { fireProfessionalTap } from "./track-tap";

/** Conta "ver perfil" quando a pessoa chega ao perfil vindo de uma sugestão (receita, Alimentação…). */
export function TapOnView({ tap }: { tap: ProfessionalTap }) {
  useEffect(() => {
    fireProfessionalTap(tap);
    // um toque por abertura da página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
