import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { wearablesRealEnabled } from "@/lib/health/config";
import { hasHealthDb } from "@/lib/health/db";
import { tick } from "@/lib/health/pipeline";

// Tique de wearables (§9.5, §10): novas tentativas do inbox e da fila de revogações na marca.
// Segredo próprio (WEARABLES_TICK_SECRET), não o CRON_SECRET. Com a chave desligada, não faz nada.
// Agendamento (a cada 10 min) fica fora do vercel.json enquanto o plano for Hobby: pg_cron + pg_net
// com o segredo no Vault, ou Vercel Pro (roteiro de ligar).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function handler(request: Request) {
  const secret = process.env.WEARABLES_TICK_SECRET;
  if (!wearablesRealEnabled()) return json({ ok: true, skipped: "disabled" });
  if (!secret) return json({ ok: false, error: "tick_secret_missing" }, 500);
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return json({ ok: false, error: "forbidden" }, 403);
  if (!hasHealthDb()) return json({ ok: false, error: "health_ingest_not_configured" }, 500);
  try {
    return json({ ok: true, ...(await tick()) });
  } catch (error) {
    console.error("[cron:wearables] erro", error instanceof Error ? error.message.slice(0, 120) : "unknown");
    return json({ ok: false, error: "tick_failed" }, 500);
  }
}

export { handler as GET, handler as POST };
