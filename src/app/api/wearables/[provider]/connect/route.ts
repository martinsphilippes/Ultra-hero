import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/session";
import { callbackUrl, providerReady } from "@/lib/health/config";
import { stateKey } from "@/lib/health/crypto";
import { authorizeUrl, createOAuthState, OAUTH_COOKIE, OAUTH_TTL_MS } from "@/lib/health/oauth";
import { PROVIDERS, providerScopes } from "@/lib/health/providers";
import { isHealthProvider } from "@/lib/health/types";
import { myConsent } from "@/lib/health/user";
import { createClient } from "@/lib/supabase/server";

// Início do OAuth (§6.1 A, §9.3): exige sessão, conta real, consentimento vigente e a marca ligada
// (WEARABLES_REAL_ENABLED=1 + credenciais). state + PKCE vão num cookie httpOnly assinado; os
// escopos pedidos são só os das categorias consentidas. Marca desligada → 404 (a rota "não existe").
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isHealthProvider(provider) || !providerReady(provider)) return new NextResponse(null, { status: 404 });
  const back = (erro: string) => NextResponse.redirect(new URL(`/profile/devices?erro=${erro}`, request.url), 303);

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/profile/devices/connect/${provider}`)}`, request.url), 303);
  const consent = await myConsent(await createClient());
  if (consent === "unavailable") return back("unavailable");
  if (!consent || consent.outdated) return NextResponse.redirect(new URL(`/profile/devices/connect/${provider}`, request.url), 303);

  const def = PROVIDERS[provider];
  const { state, challenge, cookie } = createOAuthState({ provider, userId: user.id, pkce: def.pkce, key: stateKey() });
  const url = authorizeUrl({
    base: def.authorizeUrl,
    clientId: process.env[def.envClientId] ?? "",
    redirectUri: callbackUrl(provider),
    scopes: providerScopes(provider, consent.categories),
    state,
    challenge,
  });
  const res = NextResponse.redirect(url, 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(OAUTH_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: `/api/wearables/${provider}`, maxAge: OAUTH_TTL_MS / 1000 });
  return res;
}
