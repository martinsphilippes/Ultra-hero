import { after, NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/session";
import { providerReady } from "@/lib/health/config";
import { stateKey } from "@/lib/health/crypto";
import { OAUTH_COOKIE, verifyOAuthState } from "@/lib/health/oauth";
import { exchangeCode, fetchProviderUserId, ProviderError, registerPolarUser } from "@/lib/health/provider-api";
import { providerScopes } from "@/lib/health/providers";
import { processEvents } from "@/lib/health/pipeline";
import { openConnection, receiveEvent, setConnectionStatus, storeCredentials } from "@/lib/health/store";
import { isHealthProvider } from "@/lib/health/types";
import { myConsent } from "@/lib/health/user";
import { createClient } from "@/lib/supabase/server";

// Volta do OAuth (§9.3): confere state (+ PKCE) contra o cookie e a pessoa logada, troca o código,
// lê SÓ o id da pessoa na marca, cifra os tokens e ativa a conexão (papel health_ingest). Nada de
// token nos logs. Depois volta ao Hoje, que mostra "Sincronizando…" até o primeiro dado.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isHealthProvider(provider) || !providerReady(provider)) return new NextResponse(null, { status: 404 });
  const back = (erro: string) => {
    const res = NextResponse.redirect(new URL(`/profile/devices?erro=${erro}`, request.url), 303);
    res.cookies.delete({ name: OAUTH_COOKIE, path: `/api/wearables/${provider}` });
    return res;
  };

  const user = await getUser();
  if (!user) return back("state");
  const search = request.nextUrl.searchParams;
  const check = verifyOAuthState({ cookie: request.cookies.get(OAUTH_COOKIE)?.value, state: search.get("state"), provider, userId: user.id, key: stateKey() });
  if (!check.ok) return back("state");
  if (search.get("error")) return back("denied");
  const code = search.get("code");
  if (!code || code.length > 2048) return back("state");

  const consent = await myConsent(await createClient());
  if (consent === "unavailable" || !consent || consent.outdated) return back("noConsent");

  let connectionId: string | null = null;
  let activated = false;
  try {
    const tokens = await exchangeCode(provider, code, check.verifier);
    const providerUserId = await fetchProviderUserId(provider, tokens.accessToken, tokens.providerUserId);
    connectionId = await openConnection({ userId: user.id, provider, providerUserId, scopes: providerScopes(provider, consent.categories), deviceName: null });
    // Polar: registrar a pessoa no AccessLink (member-id = id da conexão, sem dado pessoal)
    if (provider === "polar") await registerPolarUser(tokens.accessToken, connectionId);
    await storeCredentials({ connectionId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, activate: true });
    activated = true;
    console.log("[wearables] conexão ativa", JSON.stringify({ provider }));
    // carga inicial (Oura/WHOOP): os webhooks só avisam do que muda daqui em diante
    if (provider === "oura" || provider === "whoop") {
      const ev = await receiveEvent({ provider, providerUserId, kind: "initial", eventId: `initial:${connectionId}:${Date.now()}`, payload: { initial: true } });
      const eventId = ev.event_id;
      if (ev.status === "received" && eventId) after(() => processEvents([eventId]));
    }
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : error instanceof Error && /provider_account_in_use/.test(error.message) ? "provider_account_in_use" : "callback_error";
    console.warn("[wearables] callback falhou", JSON.stringify({ provider, code }));
    // conexão aberta e não ativada não pode ficar "pending" (o Hoje diria "sincronizando" para sempre):
    // vira "error", com "Reconectar" em Relógios e anéis (apagada em 30 dias pela retenção).
    // já ativa: só a carga inicial falhou (os webhooks e o tique seguem) e a pessoa volta como conectada
    if (!activated) {
      if (connectionId) await setConnectionStatus(connectionId, "error", code).catch(() => {});
      return back(code === "provider_account_in_use" ? "inUse" : code === "callback_error" ? "generic" : "provider");
    }
  }

  const res = NextResponse.redirect(new URL(`/profile?conectado=${provider}`, request.url), 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.delete({ name: OAUTH_COOKIE, path: `/api/wearables/${provider}` });
  return res;
}
