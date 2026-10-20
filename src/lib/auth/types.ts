// Estado devolvido pelas server actions de autenticação (chaves de tradução, nunca texto).
export type AuthField = "email" | "password" | "confirmPassword" | "displayName";

export type AuthFieldErrors = Partial<Record<AuthField, string>>;

export type AuthActionState =
  | { status: "idle" }
  | { status: "error"; error?: string; fieldErrors?: AuthFieldErrors }
  | { status: "success" };

export const initialAuthState: AuthActionState = { status: "idle" };

// Chaves de erro aceitas via query string (?error=) na tela de login.
// experimentClosed: conta nova recusada pelo banco com o cadastro fechado (kill switch experiment.open).
// accountSuspended: conta suspensa pela administração (ban no Auth).
export const AUTH_QUERY_ERRORS = ["oauth", "callback", "invalidLink", "sessionRequired", "experimentClosed", "accountSuspended"] as const;
export type AuthQueryError = (typeof AUTH_QUERY_ERRORS)[number];

export function isAuthQueryError(value: unknown): value is AuthQueryError {
  return typeof value === "string" && (AUTH_QUERY_ERRORS as readonly string[]).includes(value);
}
