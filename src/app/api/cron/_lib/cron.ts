import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Utilitários dos endpoints /api/cron/*: autorização por CRON_SECRET (Bearer) e cliente de sistema.
// Vercel Cron envia "Authorization: Bearer <CRON_SECRET>". Sem segredo configurado → 500; errado → 403.

export function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ ok: false, error: "cron_secret_missing" }, 500);
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) return json({ ok: false, error: "forbidden" }, 403);
  if (!hasAdminClient()) return json({ ok: false, error: "service_role_missing" }, 500);
  return null;
}

// Executa um job com o service role, registrando início/fim/erro no console.
export async function runCronJob(request: Request, job: string, work: (admin: ReturnType<typeof createAdminClient>) => Promise<Record<string, unknown>>) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const started = Date.now();
  console.log(`[cron:${job}] início`);
  try {
    const result = await work(createAdminClient());
    const payload = { ok: true, job, ran_at: new Date().toISOString(), duration_ms: Date.now() - started, ...result };
    console.log(`[cron:${job}] fim`, JSON.stringify(payload));
    return json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron:${job}] erro`, message);
    return json({ ok: false, job, error: message }, 500);
  }
}
