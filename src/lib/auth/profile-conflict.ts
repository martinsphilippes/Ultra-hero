// Um e-mail, um perfil de negócio (0116): o banco recusa dar a uma conta um tipo diferente do que ela já tem com
// 'profile_conflict:<tipo>' (hero | brand | agency). Módulo puro (testável): reconhece o erro e o tipo para a tela
// dizer "Este e-mail já é usado por uma conta de {tipo}. Use outro e-mail." (ICU select em {kind}).
export const PROFILE_CONFLICT = "profile_conflict";
export const BUSINESS_KINDS = ["hero", "brand", "agency"] as const;
export type BusinessKind = (typeof BUSINESS_KINDS)[number];

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return (error as { message?: string } | null)?.message ?? "";
}

/** Tipo que a conta já tem, se o erro for de conflito de perfil; senão nulo. */
export function profileConflictKind(error: unknown): BusinessKind | null {
  const match = /profile_conflict:(hero|brand|agency)\b/.exec(messageOf(error));
  return match ? (match[1] as BusinessKind) : null;
}

/** Parâmetros da mensagem traduzida (kind = "other" quando o banco não disse o tipo). */
export function profileConflictParams(error: unknown): { kind: BusinessKind | "other" } {
  return { kind: profileConflictKind(error) ?? "other" };
}

/** Tipo de perfil de negócio pelos papéis da conta (creator = herói). Nulo = só consumidor (ou admin). */
export function businessKindOfRoles(roles: readonly string[]): BusinessKind | null {
  if (roles.includes("agency")) return "agency";
  if (roles.includes("brand")) return "brand";
  if (roles.includes("creator")) return "hero";
  return null;
}
