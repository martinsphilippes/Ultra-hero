import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Combina classes condicionais e resolve conflitos de utilitários Tailwind.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Gera um hash inteiro estável a partir de uma string (para escolher placeholders).
export function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Iniciais (máx. 2 letras) a partir de um nome de exibição.
export function initials(name?: string | null): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
