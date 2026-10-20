import { defaultTimeZone } from "@/i18n/config";

// Fuso usado para exibir datas ("Concluído em…"): o do perfil quando é válido, senão o padrão.
// Um valor inválido em profiles.timezone não pode derrubar a página.
export function displayTimeZone(candidate: string | null | undefined): string {
  if (!candidate) return defaultTimeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return defaultTimeZone;
  }
}
