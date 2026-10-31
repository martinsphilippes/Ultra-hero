import { NextResponse } from "next/server";
import { buildIcs, type IcsEvent } from "@/lib/calendar/ics";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// GET /api/agenda/<token>.ics → feed iCalendar da pessoa (assinatura em Google/Apple/Outlook) ou download
// (?download=1). O token (64 hex, só o SHA-256 fica no banco) é resolvido pelo service role com as mesmas
// regras de visibilidade da agenda; revogado ou inválido → 404. Sem valores em nenhum evento.

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token: raw } = await context.params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{64}$/.test(token) || !hasAdminClient()) return new NextResponse(null, { status: 404, headers: HEADERS });
  const { data, error } = await createAdminClient().rpc("calendar_feed_resolve", { p_token: token });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return new NextResponse(null, { status: 404, headers: HEADERS });
  const payload = data as { events?: unknown };
  const events: IcsEvent[] = Array.isArray(payload.events)
    ? (payload.events as Record<string, unknown>[]).map((e) => ({
        id: String(e.id),
        title: String(e.title ?? ""),
        subtitle: (e.subtitle as string | null) ?? null,
        description: [e.brand ? String(e.brand) : null, e.description ? String(e.description) : null].filter(Boolean).join("\n") || null,
        location: (e.location as string | null) ?? null,
        startsAt: String(e.starts_at),
        endsAt: String(e.ends_at),
        allDay: Boolean(e.all_day),
        updatedAt: (e.updated_at as string | null) ?? null,
      }))
    : [];
  const body = buildIcs(events, { calendarName: "Groscove Ultra · Agenda", timeZone: "America/Sao_Paulo" });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(body, {
    status: 200,
    headers: { ...HEADERS, "Content-Type": "text/calendar; charset=utf-8", ...(download ? { "Content-Disposition": 'attachment; filename="agenda-groscove-ultra.ics"' } : {}) },
  });
}
