import { UFS, US_STATES } from "./vocab";

// Casting por país (0144): Brasil e EUA no mesmo casting, separados pelo seletor da tela. O país mora em
// talent_profiles.country (ISO de 2 letras); o endereço usa ?pais=us (sem o parâmetro = Brasil, o casting de sempre).

export const CASTING_COUNTRIES = ["BR", "US"] as const;
export type CastingCountry = (typeof CASTING_COUNTRIES)[number];

export function isCastingCountry(value: unknown): value is CastingCountry {
  return value === "BR" || value === "US";
}

/** ?pais=… → país do casting (qualquer outro valor, ou nenhum, é o Brasil). */
export function castingCountryFromParam(value: unknown): CastingCountry {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim().toLowerCase() === "us" ? "US" : "BR";
}

/** Valor do ?pais= no endereço: nenhum para o Brasil (padrão), "us" para os EUA. */
export function castingCountryParam(country: CastingCountry): string | undefined {
  return country === "US" ? "us" : undefined;
}

/** Endereço com o país do casting (mantém os outros parâmetros). */
export function withCastingCountry(path: string, country: CastingCountry): string {
  const param = castingCountryParam(country);
  return param ? `${path}${path.includes("?") ? "&" : "?"}pais=${param}` : path;
}

/** Estados da ficha conforme o país do Hero (UF para o Brasil). */
export function statesFor(country: string | null | undefined): readonly string[] {
  return country === "US" ? US_STATES : UFS;
}
