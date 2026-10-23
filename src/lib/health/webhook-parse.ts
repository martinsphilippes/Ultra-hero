// Corpo do webhook (já verificado) → itens do inbox, um por pessoa e recurso. Puro.
// Garmin manda o dado (push) ou a URL para buscar (ping); Oura, WHOOP e Polar só avisam e o
// servidor busca o recurso depois, com o token da pessoa (pipeline.ts).

import { createHash } from "node:crypto";
import { splitGarminBody } from "./adapters/garmin";
import { parseOuraNotification } from "./adapters/oura";
import { parsePolarNotification } from "./adapters/polar";
import { parseWhoopNotification } from "./adapters/whoop";
import type { HealthProvider } from "./types";

export type InboxItem = { providerUserId: string; kind: string; eventId: string | null; payload: Record<string, unknown> };

const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/**
 * Hash de idempotência do inbox: cobre a IDENTIDADE da notificação (eventId) e o conteúdo. Oura,
 * WHOOP e Polar mandam só o recurso (o mesmo daily_activity muda ao longo do dia): sem o eventId no
 * hash, toda notificação seguinte do mesmo objeto voltaria "duplicate" e o dado pararia de atualizar.
 */
export function inboxHash(item: { eventId: string | null; payload: unknown }): string {
  return createHash("sha256").update(JSON.stringify({ eventId: item.eventId, payload: item.payload ?? null })).digest("hex");
}

export function parseWebhook(provider: HealthProvider, body: unknown): InboxItem[] {
  switch (provider) {
    case "garmin":
      return splitGarminBody(body).map((item) => ({
        providerUserId: item.providerUserId,
        kind: item.kind,
        // a Garmin reenvia o resumo do dia com o MESMO summaryId quando ele muda: o conteúdo entra no id
        // (o mesmo resumo repetido continua duplicado; o atualizado entra)
        eventId: item.callbackURL ? `${item.kind}:ping:${short(item.callbackURL)}` : item.eventId ? `${item.eventId}:${short(JSON.stringify(item.payload))}`.slice(0, 200) : null,
        payload: item.callbackURL ? { callbackURL: item.callbackURL } : item.payload,
      }));
    case "oura": {
      const n = parseOuraNotification(body);
      if (!n) return [];
      return [{ providerUserId: n.providerUserId, kind: n.kind, eventId: `${n.kind}:${n.objectId}:${n.eventType}:${n.eventTime ?? ""}`.slice(0, 200), payload: { kind: n.kind, objectId: n.objectId, eventType: n.eventType } }];
    }
    case "whoop": {
      const n = parseWhoopNotification(body);
      if (!n) return [];
      return [{ providerUserId: n.providerUserId, kind: n.kind, eventId: (n.traceId ? `trace:${n.traceId}` : `${n.kind}:${n.objectId}:${n.deleted ? "deleted" : "updated"}`).slice(0, 200), payload: { kind: n.kind, objectId: n.objectId, deleted: n.deleted } }];
    }
    case "polar": {
      const n = parsePolarNotification(body);
      if (!n || n.event === "PING") return [];
      const ts = body && typeof body === "object" ? String((body as Record<string, unknown>).timestamp ?? "") : "";
      return [{ providerUserId: n.providerUserId, kind: n.event.toLowerCase(), eventId: `${n.event}:${n.entityId ?? n.date ?? ""}:${ts}`.slice(0, 200), payload: { event: n.event, entityId: n.entityId, date: n.date } }];
    }
  }
}
