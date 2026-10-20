// Serialização da justificativa em user_recommendations.reason (texto). Tolerante a dados antigos.
import type { Reason, ReasonKey } from "./types";

const KEYS: ReasonKey[] = ["interest", "pillar", "difficulty", "fresh", "featured", "text", "generic"];

export function serializeReason(reason: Reason): string {
  return JSON.stringify(reason);
}

export function parseReason(raw: string | null | undefined): Reason {
  if (!raw) return { key: "generic" };
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && "key" in value) {
      const candidate = value as { key: unknown; params?: unknown };
      if (typeof candidate.key === "string" && (KEYS as string[]).includes(candidate.key)) {
        const params =
          candidate.params && typeof candidate.params === "object"
            ? Object.fromEntries(
                Object.entries(candidate.params as Record<string, unknown>).filter(
                  (entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number",
                ),
              )
            : undefined;
        return { key: candidate.key as ReasonKey, params };
      }
    }
  } catch {
    // texto livre legado: trata como justificativa do provedor
  }
  return { key: "text", params: { text: raw.slice(0, 140) } };
}
