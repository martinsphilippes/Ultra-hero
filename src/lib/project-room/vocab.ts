// Sala do projeto (0110): vocabulário e lógica pura (testável). Espelha os checks e as regras do banco.
import { buildIcs } from "@/lib/calendar/ics";

export const ROOM_SIDES = ["agency", "staff", "talent", "brand"] as const;
export type RoomSide = (typeof ROOM_SIDES)[number];
export const isRoomSide = (v: unknown): v is RoomSide => typeof v === "string" && (ROOM_SIDES as readonly string[]).includes(v);

/** Portal de onde a pessoa abre a sala (define o endereço e o que revalidar). */
export const ROOM_PORTALS = ["agency", "brand", "talent", "staff"] as const;
export type RoomPortal = (typeof ROOM_PORTALS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Endereço da sala para cada portal (mesma regra de public.project_room_link). */
export function roomHref(portal: RoomPortal, dealId: string): string {
  switch (portal) {
    case "agency":
      return `/agencia/negocios/${dealId}/sala`;
    case "brand":
      return `/marca/projetos/${dealId}`;
    case "talent":
      return `/heroi/projetos/${dealId}`;
    default:
      return `/projetos/${dealId}`;
  }
}

/** Clipping de cada portal (o staff externo não tem: é do cliente e da agência). */
export function clippingHref(portal: Exclude<RoomPortal, "staff">, dealId: string): string {
  return portal === "agency" ? `/agencia/negocios/${dealId}/clipping` : `${roomHref(portal, dealId)}/clipping`;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// Arquivos aceitos na sala (iguais a public.project_room_mime_ext e ao bucket agency-docs após a 0110)
export const ROOM_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
] as const;
export type RoomMime = (typeof ROOM_MIME_TYPES)[number];
export const ROOM_MAX_BYTES = 20 * 1024 * 1024;
export const isRoomMime = (v: unknown): v is RoomMime => typeof v === "string" && (ROOM_MIME_TYPES as readonly string[]).includes(v);

/** Tipo do arquivo para a tela: foto (mostra miniatura), áudio (player), PDF ou outro. */
export function attachmentKind(mime: string | null | undefined): "image" | "audio" | "pdf" | "file" {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "file";
}

/** Normaliza o tipo informado pelo navegador (alguns celulares mandam vazio para .m4a/.mp3). */
export function guessRoomMime(fileName: string, browserType: string): RoomMime | null {
  if (isRoomMime(browserType)) return browserType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, RoomMime> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", webm: "audio/webm" };
  return byExt[ext] ?? null;
}

// ------------------------------------------------------------------ linhas de sistema ("código|parâmetro")
export const SYSTEM_CODES = [
  "room_opened",
  "room_reopened",
  "room_archived",
  "step_done",
  "staff_joined",
  "staff_removed",
  "nda_signed",
  "shoot_day",
  "shoot_day_updated",
  "shoot_day_cancelled",
  "checkin",
  "preview",
  "usage_guide",
] as const;
export type SystemCode = (typeof SYSTEM_CODES)[number];

export type SystemLine = { code: SystemCode | "other"; param: string; date: string | null; place: string };

/** "shoot_day|2026-11-14T09:00|Estúdio Lapa" → código, data/hora local e local; "step_done|Título" → parâmetro. */
export function parseSystemLine(body: string): SystemLine {
  const [head, ...rest] = body.split("|");
  const code = (SYSTEM_CODES as readonly string[]).includes(head) ? (head as SystemCode) : "other";
  if (code === "shoot_day" || code === "shoot_day_updated" || code === "shoot_day_cancelled") {
    const [date = "", ...place] = rest;
    return { code, param: "", date: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date) ? date : null, place: place.join("|") };
  }
  return { code, param: code === "other" ? body : rest.join("|"), date: null, place: "" };
}

// ------------------------------------------------------------------ feedback (0–10) e NPS
export const FEEDBACK_MOMENTS = ["production_day", "closing"] as const;
export type FeedbackMoment = (typeof FEEDBACK_MOMENTS)[number];

/** Promotor (9–10), neutro (7–8) ou detrator (0–6), como no NPS. */
export function npsBucket(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/** NPS = % promotores − % detratores (−100..100); null sem respostas. */
export function npsScore(promoters: number, passives: number, detractors: number): number | null {
  const total = promoters + passives + detractors;
  if (total <= 0) return null;
  return Math.round(((promoters - detractors) / total) * 100);
}

// ------------------------------------------------------------------ clipping: totais e taxa de engajamento
/** Engajamento ÷ alcance (ou visualizações quando não há alcance), em %, com 1 casa; null sem base. */
export function engagementRate(engagement: number, reach: number, views = 0): number | null {
  const base = reach > 0 ? reach : views;
  if (base <= 0 || engagement < 0) return null;
  return Math.round((engagement / base) * 1000) / 10;
}

// ------------------------------------------------------------------ diária: .ics para "Adicionar à agenda"
export type ShootIcsInput = { id: string; title: string; location: string; mapUrl: string | null; startsAt: string; endsAt: string; notes?: string };

export function buildShootIcs(input: ShootIcsInput, timeZone = "America/Sao_Paulo", now?: Date): string {
  return buildIcs(
    [
      {
        id: `shoot-${input.id}`,
        title: input.title,
        description: [input.mapUrl, input.notes].filter(Boolean).join("\n") || null,
        location: input.location,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: false,
        url: input.mapUrl && /^https:\/\//.test(input.mapUrl) ? input.mapUrl : null,
      },
    ],
    { calendarName: input.title, timeZone, now },
  );
}

/** Link do mapa: o informado (https) ou uma busca pelo endereço. */
export function mapHref(location: string, mapUrl: string | null): string {
  if (mapUrl && /^https:\/\//i.test(mapUrl)) return mapUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** Check-in liberado de 12 h antes do início até 12 h depois do fim (mesma janela de public.project_checkin). */
export function checkinOpen(startsAt: string, endsAt: string, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= new Date(startsAt).getTime() - 12 * 3600_000 && t <= new Date(endsAt).getTime() + 12 * 3600_000;
}
