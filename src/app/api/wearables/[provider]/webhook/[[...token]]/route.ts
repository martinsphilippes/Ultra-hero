import { after, NextResponse, type NextRequest } from "next/server";
import { providerReady } from "@/lib/health/config";
import { processEvents } from "@/lib/health/pipeline";
import { receiveEvent } from "@/lib/health/store";
import { isHealthProvider, type HealthProvider } from "@/lib/health/types";
import { parseWebhook } from "@/lib/health/webhook-parse";
import { verifyGarminPathToken, verifyOura, verifyPolar, verifyWhoop, WEBHOOK_MAX_BYTES } from "@/lib/health/webhooks";

// Webhooks das marcas (§9.4, §8.8). Ordem: marca ligada? → tamanho → ASSINATURA (inválida → 401
// sem gravar nada) → conexão resolvida antes de gravar → inbox idempotente → 200 rápido → o
// processamento (busca na marca, lista permitida, normalização, gravação) roda depois, em after().
// Logs só com marca, status e contagens — nunca corpo, token ou valor.
// Garmin não tem HMAC público: o token de caminho (≥ 128 bits) vai no último segmento da URL.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ provider: string; token?: string[] }> };

const invalidSignatures: Record<string, number> = {};

function verify(provider: HealthProvider, request: NextRequest, body: string, token: string | undefined): boolean {
  const h = (name: string) => request.headers.get(name);
  switch (provider) {
    case "garmin":
      return verifyGarminPathToken(token, process.env.GARMIN_WEBHOOK_PATH_TOKEN, process.env.GARMIN_WEBHOOK_PATH_TOKEN_PREVIOUS);
    case "oura":
      return !token && verifyOura({ body, signature: h("x-oura-signature"), timestamp: h("x-oura-timestamp"), secret: process.env.OURA_CLIENT_SECRET ?? "" });
    case "whoop":
      return !token && verifyWhoop({ body, signature: h("x-whoop-signature"), timestamp: h("x-whoop-signature-timestamp"), secret: process.env.WHOOP_CLIENT_SECRET ?? "" });
    case "polar":
      return !token && verifyPolar({ body, signature: h("polar-webhook-signature"), secret: process.env.POLAR_WEBHOOK_SECRET ?? "" });
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { provider, token } = await params;
  if (!isHealthProvider(provider) || !providerReady(provider)) return new NextResponse(null, { status: 404 });
  if ((token?.length ?? 0) > 1) return new NextResponse(null, { status: 404 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > WEBHOOK_MAX_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > WEBHOOK_MAX_BYTES) return NextResponse.json({ ok: false }, { status: 413 });

  if (!verify(provider, request, body, token?.[0])) {
    invalidSignatures[provider] = (invalidSignatures[provider] ?? 0) + 1;
    console.warn("[wearables] assinatura inválida", JSON.stringify({ provider, count: invalidSignatures[provider] }));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const items = parseWebhook(provider, parsed);
  const received: string[] = [];
  let ignored = 0;
  for (const item of items) {
    const r = await receiveEvent({ provider, providerUserId: item.providerUserId, kind: item.kind, eventId: item.eventId, payload: item.payload });
    if (r.status === "received" && r.event_id) received.push(r.event_id);
    else ignored += 1;
  }
  if (received.length > 0) after(() => processEvents(received));
  console.log("[wearables] webhook", JSON.stringify({ provider, items: items.length, received: received.length, ignored }));
  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

// Oura confirma a inscrição do webhook com um desafio GET (verification_token + challenge).
export async function GET(request: NextRequest, { params }: Ctx) {
  const { provider, token } = await params;
  if (provider !== "oura" || token?.length || !providerReady("oura")) return new NextResponse(null, { status: 404 });
  const search = request.nextUrl.searchParams;
  const expected = process.env.OURA_WEBHOOK_VERIFICATION_TOKEN ?? "";
  const challenge = search.get("challenge") ?? "";
  if (!expected || search.get("verification_token") !== expected || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ challenge }, { status: 200 });
}
