// Agendamento de publicação (RF-007): regras puras compartilhadas pela UI do admin e pela
// server action. O banco aplica a mesma semântica (data passada ou nula = publicar agora).

export type PublishAtParse = { ok: true; value: string | null } | { ok: false; error: "publish_at_invalid" | "publish_at_future" };

/** Antecedência mínima: evita agendar para "agora mesmo" por atraso de relógio entre navegador e banco. */
export const MIN_LEAD_MS = 60_000;

/** Normaliza o campo "Publicar em": vazio = publicar agora (null); senão precisa ser data válida no futuro. */
export function parsePublishAt(input: string | null | undefined, now: Date = new Date()): PublishAtParse {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "publish_at_invalid" };
  if (date.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, error: "publish_at_future" };
  return { ok: true, value: date.toISOString() };
}

/** Valor de <input type="datetime-local"> (hora local do dispositivo do admin) → ISO em UTC. */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) return null;
  const date = new Date(value.trim()); // sem sufixo de fuso: o navegador interpreta como hora local
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO → valor para datetime-local num fuso (para preencher o campo com o agendamento atual). */
export function isoToLocalInput(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Publicado com data futura = agendado (mesma regra de public.content_is_live, invertida). */
export function isScheduled(status: string, publishAt: string | null | undefined, now: Date = new Date()): boolean {
  if (status !== "published" || !publishAt) return false;
  const at = new Date(publishAt).getTime();
  return Number.isFinite(at) && at > now.getTime();
}
