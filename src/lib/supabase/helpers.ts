import type { Database } from "./database.types";

// Atalhos de tipos gerados. Ex.: Tables<"content">, Enums<"pillar">, FnArgs<"checkout_cart">.
export type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type FnArgs<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Args"];
export type FnReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];

export type Pillar = Enums<"pillar">;
export type ContentType = Enums<"content_type">;
export type AccessLevel = Enums<"access_level">;
export type LocaleCode = Enums<"locale_code">;

export const PILLARS: Pillar[] = ["routine", "training", "nutrition", "gastronomy"];
export const CONTENT_TYPES: ContentType[] = ["video", "recipe", "workout", "guide", "article"];

// Mensagens de erro vindas de RAISE EXCEPTION chegam como "codigo" ou "codigo: detalhe".
export function rpcErrorCode(message: string | undefined | null): string {
  if (!message) return "unknown";
  return message.split(":")[0].trim();
}

/** Erro de banco que significa "a migração ainda não chegou aqui": tabela/coluna/função inexistente
 *  (42P01/42703/42883) ou fora do cache da API (PGRST205 tabela, PGRST204 coluna, PGRST202 função,
 *  PGRST200 relação de embed). As telas tratam como "módulo em atualização", sem erro 500. */
export function isMissingSchema(error: { code?: string | null } | null | undefined): boolean {
  return Boolean(error?.code && ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error.code));
}
