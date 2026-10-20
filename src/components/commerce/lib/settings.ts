// Leitura do kill switch "commerce.enabled" a partir do retorno de public_settings().
// Setting ausente ou ilegível = ligado (o banco continua barrando checkout/carrinho se estiver desligado).
export function isCommerceEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return true;
  const value = (settings as Record<string, unknown>)["commerce.enabled"];
  if (value === false) return false;
  return !(typeof value === "string" && value.trim().toLowerCase() === "false");
}
