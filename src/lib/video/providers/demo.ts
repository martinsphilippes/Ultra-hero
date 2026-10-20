import type { DemoSource, TranscriptLine } from "../types";

// "Provedor" do conteúdo sem mídia (media_provider = 'none'): devolve uma fonte simulada
// com a transcrição do corpo fazendo o papel das legendas. Não implementa VideoProvider
// porque não há reprodução real; é um fallback explícito e identificado na UI.

const DEFAULT_DURATION_SEC = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normaliza body.transcript ([{t,text}]) ignorando entradas malformadas. */
export function parseTranscript(value: unknown): TranscriptLine[] {
  if (!Array.isArray(value)) return [];
  const lines: TranscriptLine[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const t = Number(entry.t);
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!Number.isFinite(t) || t < 0 || !text) continue;
    lines.push({ t: Math.floor(t), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

type DemoInput = {
  body: unknown;
  durationMinutes: number | null;
  poster?: string | null;
};

/** Monta a fonte do player simulado a partir do corpo e da duração declarada. */
export function getDemoSource({ body, durationMinutes, poster }: DemoInput): DemoSource {
  const transcript = parseTranscript(isRecord(body) ? body.transcript : undefined);
  const lastLine = transcript.length > 0 ? transcript[transcript.length - 1].t + 20 : 0;
  const declared = durationMinutes && durationMinutes > 0 ? durationMinutes * 60 : 0;
  const durationSec = Math.max(declared, lastLine, declared === 0 && lastLine === 0 ? DEFAULT_DURATION_SEC : 0);
  return { type: "demo", durationSec, transcript, poster: poster ?? undefined };
}
