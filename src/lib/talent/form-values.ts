// Valores do formulário do talento num módulo comum (sem "use client"): páginas do servidor importam daqui.
import type { Availability, CommercialStatus } from "@/lib/talent/vocab";

export type TalentFormValues = {
  id: string | null;
  displayName: string;
  city: string;
  state: string;
  /** 0144: país do casting ("BR" ou "US"); os estados da ficha seguem o país. */
  country: string;
  managerId: string;
  commercialStatus: CommercialStatus;
  availability: Availability;
  availabilityNote: string;
  contactEmail: string;
  contactPhone: string;
  internalNotes: string;
  lastContactAt: string;
};

export const EMPTY_TALENT: TalentFormValues = {
  id: null,
  displayName: "",
  city: "",
  state: "",
  country: "BR",
  managerId: "",
  commercialStatus: "prospect",
  availability: "available",
  availabilityNote: "",
  contactEmail: "",
  contactPhone: "",
  internalNotes: "",
  lastContactAt: "",
};
